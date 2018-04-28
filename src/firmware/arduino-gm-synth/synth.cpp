#include "synth.h"

// Map MIDI notes [0..127] to the corresponding Q8.8 sampling interval
constexpr uint16_t Synth::_noteToPitch[] PROGMEM;
constexpr uint8_t Synth::offsetTable[];

volatile const int8_t*  Synth::v_wave[Synth::numVoices]    = { 0 };        // Starting address of 256b wave table.
volatile uint16_t       Synth::v_phase[Synth::numVoices]   = { 0 };        // Phase accumulator holding the Q8.8 offset of the next sample.
volatile uint16_t       Synth::v_pitch[Synth::numVoices]   = { 0 };        // Q8.8 sampling period, used to advance the '_phase' accumulator.
volatile int8_t         Synth::v_xor[Synth::numVoices]     = { 0 };        // XOR bits applied to each sample (for effect).
volatile uint8_t        Synth::v_amp[Synth::numVoices]     = { 0 };        // 6-bit amplitude scale applied to each sample.
volatile bool           Synth::v_isNoise[Synth::numVoices] = { 0 };        // If true, '_xor' is periodically overwritten with random values.

volatile Lerp           Synth::v_ampMod[Synth::numVoices]  = {};           // Amplitude modulation
volatile Lerp           Synth::v_freqMod[Synth::numVoices] = {};			// Frequency modulation
volatile Lerp           Synth::v_waveMod[Synth::numVoices] = {};			// Wave offset modulation
	
volatile uint8_t        Synth::v_vol[Synth::numVoices]     = { 0 };        // 7-bit volume scalar applied to ADSR output.

volatile uint16_t		Synth::v_basePitch[Synth::numVoices]	= { 0 };	// Original Q8.8 sampling period, prior to modulation, pitch bend, etc.
volatile uint16_t		Synth::v_bentPitch[Synth::numVoices]	= { 0 };	// Q8.8 sampling post pitch bend, but prior to freqMod.
volatile const int8_t*  Synth::v_baseWave[Synth::numVoices]	= { 0 };    // Original starting address in wavetable.
volatile uint8_t		Synth::_note[Synth::numVoices]			= { 0 };    // Index of '_basePitch' in the '_pitches' table, used for pitch bend calculation.

// Audio output as biased/unsigned (0 signed -> 0x8000).
uint16_t Synth::wavOut = 0x8000;

SIGNAL(TIMER2_COMPA_vect) {
	Synth::isr();
}

#ifdef __EMSCRIPTEN__
uint16_t Synth::sample() {
	TIMER2_COMPA_vect();
	return wavOut;
}
#endif // __EMSCRIPTEN__

// Returns the next idle voice, if any.  If no voice is idle, uses ADSR stage and amplitude to
// choose the best candidate for note-stealing.
constexpr uint8_t offsetTable[] = { 0, 0, 1, 1, 2, 3, 3, 3 };

void Synth::noteOn(uint8_t voice, uint8_t note, uint8_t velocity, const Instrument& instrument) {
	const uint8_t flags = instrument.flags;
    if (flags & InstrumentFlags_HalfAmplitude) {
        velocity >>= 1;
    }
    
    bool isNoise = flags & InstrumentFlags_Noise;
	
	uint8_t noteOffset = offsetTable[note >> 4];
	uint8_t ampOffset = flags & InstrumentFlags_SelectAmplitude
		? noteOffset
		: 0;
		
	uint8_t waveOffset = flags & InstrumentFlags_SelectWave
		? noteOffset << 6
		: 0;
		
    _note[voice] = note;

    uint16_t pitch = pgm_read_word(&_noteToPitch[note]);

#if DEBUG
	pitch <<= 1;						// Reduce sampling frequency by 1/2 in DEBUG (non-optimized) builds to
#endif                                  // avoid starving MIDI dispatch.

    // Suspend audio processing before updating state shared with the ISR.
    suspend();

    v_wave[voice] = v_baseWave[voice] = instrument.wave + waveOffset;
    v_phase[voice] = 0;
    v_pitch[voice] = v_bentPitch[voice] = v_basePitch[voice] = pitch;
    v_xor[voice] = instrument.xorBits;
    v_amp[voice] = 0;
    v_isNoise[voice] = isNoise;
    v_vol[voice] = velocity;
    v_ampMod[voice].start(instrument.ampMod + ampOffset);
	v_freqMod[voice].start(instrument.freqMod);
	v_waveMod[voice].start(instrument.waveMod);
    
    resume();
}

void Synth::noteOff(uint8_t voice) {
    // Suspend audio processing before updating state shared with the ISR.
    suspend();
    v_ampMod[voice].stop();
    resume();
}

void Synth::pitchBend(uint8_t voice, int16_t value) {
    uint16_t pitch = v_basePitch[voice];
    uint16_t delta = value >= 0
		? pgm_read_word(&_noteToPitch[_note[voice] + 2]) - pitch
		: pitch - pgm_read_word(&_noteToPitch[_note[voice] - 2]);

	int32_t product;

#ifndef __EMSCRIPTEN__
	// https://mekonik.wordpress.com/2009/03/18/arduino-avr-gcc-multiplication/
	asm volatile (
		"clr r26 \n\t"
		"mul %A1, %A2 \n\t"
		"movw %A0, r0 \n\t"
		"mulsu %B1, %B2 \n\t"
		"movw %C0, r0 \n\t"
		"mul %B2, %A1 \n\t"
		"add %B0, r0 \n\t"
		"adc %C0, r1 \n\t"
		"adc %D0, r26 \n\t"
		"mulsu %B1, %A2 \n\t"
		"sbc %D0, r26 \n\t"
		"add %B0, r0 \n\t"
		"adc %C0, r1 \n\t"
		"adc %D0, r26 \n\t"
		"clr r1 \n\t"
		: "=&r" (product)
		: "a" (value), "a" (delta)
		: "r26");
#else
	product = value * delta;
#endif

    pitch += static_cast<int16_t>(product / 0x2000);

    // Suspend audio processing before updating state shared with the ISR.
    suspend();
    v_bentPitch[voice] = pitch;
    resume();
}

uint8_t Synth::getAmp(uint8_t voice) {
    return v_amp[voice];
}

void Synth::begin() {
#ifdef DAC
	_dac.setup();
#else
	//// Setup Timer1 for PWM
    //TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM11);    // Toggle OC1A/OC1B on Compare Match, Fast PWM (non-inverting)
    //TCCR1B = _BV(WGM13) | _BV(WGM12) | _BV(CS10);       // Fast PWM, Top ICR1H/L, Prescale None
    //ICR1H = 0;
    //ICR1L = 0xFF;                                       // Top = 255 (8-bit PWM per output), 62.5khz carrier frequency
    //DDRB |= _BV(DDB1) | _BV(DDB2);                      // Output PWM to DDB1 / DDB2                                                                                        
    //TIMSK1 = 0;
	
	// Setup Timer0 for PWM
    TCCR0A = _BV(COM0A1) | _BV(COM0B1) | _BV(WGM01) | _BV(WGM00);   // Fast PWM (non-inverting), Top 0xFF
    TCCR0B = _BV(CS10);												// Prescale None
    DDRD |= _BV(DDD5) | _BV(DDD6);									// Output PWM to DDD5 / DDD6
#endif

    TCCR2A = _BV(WGM21);                // CTC Mode (Clears timer and raises interrupt when OCR2B reaches OCR2A)
    TCCR2B = _BV(CS21);                 // Prescale None = C_FPU / 8 tick frequency
    OCR2A  = samplingInterval;			// Set timer top to sampling interval
#if DEBUG
    OCR2A  <<= 1;                       // Reduce sampling frequency by 1/2 in DEBUG (non-optimized) builds to
#endif                                  // avoid starving MIDI dispatch.
    TIMSK2 = _BV(OCIE2A);
}