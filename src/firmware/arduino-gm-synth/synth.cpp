#include <avr/pgmspace.h>
#include <avr/io.h>
#include <avr/common.h>
#include <avr/interrupt.h>
#include <string.h>
#include <math.h>

#include "synth.h"
#include "lerp.h"

#ifndef __EMSCRIPTEN__
constexpr static uint16_t pitch(double note) {
	return round(pow(2, (note - 69.0) / 12.0) * 440.0 / Synth::sampleRate * static_cast<double>(0xFFFF));
}
#endif

// Map MIDI notes [0..127] to the corresponding Q8.8 sampling interval
constexpr static uint16_t _midiToPitch[] PROGMEM = {
#ifndef __EMSCRIPTEN__
	pitch(0x00), pitch(0x01), pitch(0x02), pitch(0x03), pitch(0x04), pitch(0x05), pitch(0x06), pitch(0x07), pitch(0x08), pitch(0x09), pitch(0x0A), pitch(0x0B), pitch(0x0C), pitch(0x0D), pitch(0x0E), pitch(0x0F),
	pitch(0x10), pitch(0x11), pitch(0x12), pitch(0x13), pitch(0x14), pitch(0x15), pitch(0x16), pitch(0x17), pitch(0x18), pitch(0x19), pitch(0x1A), pitch(0x1B), pitch(0x1C), pitch(0x1D), pitch(0x1E), pitch(0x1F),
	pitch(0x20), pitch(0x21), pitch(0x22), pitch(0x23), pitch(0x24), pitch(0x25), pitch(0x26), pitch(0x27), pitch(0x28), pitch(0x29), pitch(0x2A), pitch(0x2B), pitch(0x2C), pitch(0x2D), pitch(0x2E), pitch(0x2F),
	pitch(0x30), pitch(0x31), pitch(0x32), pitch(0x33), pitch(0x34), pitch(0x35), pitch(0x36), pitch(0x37), pitch(0x38), pitch(0x39), pitch(0x3A), pitch(0x3B), pitch(0x3C), pitch(0x3D), pitch(0x3E), pitch(0x3F),
	pitch(0x40), pitch(0x41), pitch(0x42), pitch(0x43), pitch(0x44), pitch(0x45), pitch(0x46), pitch(0x47), pitch(0x48), pitch(0x49), pitch(0x4A), pitch(0x4B), pitch(0x4C), pitch(0x4D), pitch(0x4E), pitch(0x4F),
	pitch(0x50), pitch(0x51), pitch(0x52), pitch(0x53), pitch(0x54), pitch(0x55), pitch(0x56), pitch(0x57), pitch(0x58), pitch(0x59), pitch(0x5A), pitch(0x5B), pitch(0x5C), pitch(0x5D), pitch(0x5E), pitch(0x5F),
	pitch(0x60), pitch(0x61), pitch(0x62), pitch(0x63), pitch(0x64), pitch(0x65), pitch(0x66), pitch(0x67), pitch(0x68), pitch(0x69), pitch(0x6A), pitch(0x6B), pitch(0x6C), pitch(0x6D), pitch(0x6E), pitch(0x6F),
	pitch(0x70), pitch(0x71), pitch(0x72), pitch(0x73), pitch(0x74), pitch(0x75), pitch(0x76), pitch(0x77), pitch(0x78), pitch(0x79), pitch(0x7A), pitch(0x7B), pitch(0x7C), pitch(0x7D), pitch(0x7E), pitch(0x7F),
#else
	// Map MIDI notes [0..127] to the corresponding Q8.8 sampling interval at ~20 kHz
	0x001B, 0x001D, 0x001E, 0x0020, 0x0022, 0x0024, 0x0026, 0x0029, 0x002B, 0x002E, 0x0030, 0x0033, 0x0036, 0x0039, 0x003D, 0x0040,
	0x0044, 0x0048, 0x004D, 0x0051, 0x0056, 0x005B, 0x0060, 0x0066, 0x006C, 0x0073, 0x0079, 0x0081, 0x0088, 0x0090, 0x0099, 0x00A2,
	0x00AC, 0x00B6, 0x00C1, 0x00CC, 0x00D8, 0x00E5, 0x00F3, 0x0101, 0x0111, 0x0121, 0x0132, 0x0144, 0x0158, 0x016C, 0x0182, 0x0199,
	0x01B1, 0x01CB, 0x01E6, 0x0203, 0x0221, 0x0242, 0x0264, 0x0289, 0x02AF, 0x02D8, 0x0303, 0x0331, 0x0362, 0x0395, 0x03CC, 0x0406,
	0x0443, 0x0484, 0x04C9, 0x0511, 0x055E, 0x05B0, 0x0607, 0x0663, 0x06C4, 0x072B, 0x0798, 0x080B, 0x0886, 0x0908, 0x0991, 0x0A23,
	0x0ABD, 0x0B60, 0x0C0E, 0x0CC5, 0x0D87, 0x0E55, 0x0F30, 0x1017, 0x110C, 0x120F, 0x1322, 0x1445, 0x157A, 0x16C1, 0x181B, 0x198A,
	0x1B0F, 0x1CAB, 0x1E5F, 0x202D, 0x2217, 0x241E, 0x2644, 0x288B, 0x2AF4, 0x2D82, 0x3036, 0x3314, 0x361E, 0x3955, 0x3CBE, 0x405B,
	0x442F, 0x483C, 0x4C88, 0x5115, 0x55E7, 0x5B03, 0x606C, 0x6628, 0x6C3B, 0x72AB, 0x797C, 0x80B6, 0x885D, 0x9079, 0x9910, 0xA22A,
#endif
};

volatile const int8_t*  v_wave[Synth::numVoices]    = { 0 };        // Starting address of 256b wave table.
volatile uint16_t       v_phase[Synth::numVoices]   = { 0 };        // Phase accumulator holding the Q8.8 offset of the next sample.
volatile uint16_t       v_pitch[Synth::numVoices]   = { 0 };        // Q8.8 sampling period, used to advance the '_phase' accumulator.
volatile int8_t         v_xor[Synth::numVoices]     = { 0 };        // XOR bits applied to each sample (for effect).
volatile uint8_t        v_amp[Synth::numVoices]     = { 0 };        // 6-bit amplitude scale applied to each sample.
volatile bool           v_isNoise[Synth::numVoices] = { 0 };        // If true, '_xor' is periodically overwritten with random values.

volatile Lerp           v_ampMod[Synth::numVoices]  = {};           // Amplitude modulation
volatile Lerp           v_freqMod[Synth::numVoices] = {};			// Frequency modulation
volatile Lerp           v_waveMod[Synth::numVoices] = {};			// Wave offset modulation
	
volatile uint8_t        v_vol[Synth::numVoices]     = { 0 };        // 7-bit volume scalar applied to ADSR output.

volatile uint16_t		v_basePitch[Synth::numVoices]	= { 0 };	// Original Q8.8 sampling period, prior to modulation, pitch bend, etc.
volatile uint16_t		v_bentPitch[Synth::numVoices]	= { 0 };	// Q8.8 sampling post pitch bend, but prior to freqMod.
volatile const int8_t*  v_baseWave[Synth::numVoices]	= { 0 };    // Original starting address in wavetable.
volatile uint8_t		_note[Synth::numVoices]			= { 0 };    // Index of '_basePitch' in the '_pitches' table, used for pitch bend calculation.

#ifdef __EMSCRIPTEN__
uint16_t retValFromSample;
#endif // __EMSCRIPTEN__

// Audio output as biased/unsigned (0 signed -> 0x8000).
uint16_t wavOut = 0x8000;

SIGNAL(TIMER2_COMPA_vect) {
    TIMSK2 = 0;         // Disable timer2 interrupts to prevent reentrancy.
    sei();              // Re-enable interrupts to ensure we do not miss MIDI events.
    
    {
        static uint16_t noise = 0xACE1;                     // 16-bit maximal-period Galois LFSR
        noise = (noise >> 1) ^ (-(noise & 1) & 0xB400);     // https://en.wikipedia.org/wiki/Linear-feedback_shift_register#Galois_LFSRs
        
        static uint8_t divider = 0;                         // Time division is used to spread lower-frequency / periodic work
        divider++;                                          // across interrupts.
        
        const uint8_t voice = divider & 0x0F;				// Bottom 4 bits of 'divider' selects which voice to perform work on.
        
        if (v_isNoise[voice]) {                             // To avoid needing a large wavetable for noise, we use xor to combine
            v_xor[voice] = static_cast<uint8_t>(noise);     // the a 256B wavetable with samples from the LFSR.
        }

        const uint8_t fn = divider & 0xF0;                  // Top 4 bits of 'divider' selects which additional work to perform.
        switch (fn) {
			case 0x00: {
				int8_t freqMod = (v_freqMod[voice].sample() - 0x40);
				v_pitch[voice] = v_bentPitch[voice] + freqMod;
				break;
			}
			
			case 0x50: {
				int8_t waveMod = (v_waveMod[voice].sample());
				v_wave[voice] = v_baseWave[voice] + waveMod;
				break;
			}

			case 0xA0: {                                    // Advance the ADSR and update '_amp' for the current voice.
                uint16_t amp = v_ampMod[voice].sample();
                v_amp[voice] = (amp * v_vol[voice]) >> 8;
                break;
            }
        }
    }

    // Each interrupt, we transmit the previous output to the DAC concurrently with calculating
    // the next wavOut.  This avoids unproductive busy-waiting for SPI to finish.
        
#ifdef DAC    
    PORTB &= ~_BV(DDB2);                                                // Begin transmitting upper 8-bits to DAC.
    SPDR = wavOut >> 8;                                                 
#endif

    // Macro that advances '_phase[voice]' by the sampling interval '_pitch[voice]' and stores the next 8-bit
    // sample offset as 'offset##voice'.
    #define PHASE(voice) uint8_t offset##voice = ((v_phase[voice] += v_pitch[voice]) >> 8)

    // Macro that samples the wavetable at the offset '_wave[voice] + offset##voice', and stores as 'sample##voice'.
    #define SAMPLE(voice) int8_t sample##voice = (pgm_read_byte(v_wave[voice] + offset##voice))

    // Macro that applies '_xor[voice]' to 'sample##voice' and multiplies by '_amp[voice]'.
    #define MIX(voice) ((sample##voice ^ v_xor[voice]) * v_amp[voice])
    
    // We The below sampling/mixing code is carefully arranged to allow the compiler to make use of fixed
    // offsets for loads and stores, and to leave temporary calculations in register.
    
    PHASE(0); PHASE(1); PHASE(2); PHASE(3);                             // Advance the Q8.8 phase and calculate the 8-bit offsets into the wavetable.
    PHASE(4); PHASE(5); PHASE(6); PHASE(7);                             // (Load stores should use constant offsets and results should stay in register.)
    
    SAMPLE(0); SAMPLE(1); SAMPLE(2); SAMPLE(3);                         // Sample the wavetables at the offsets calculated above.
    SAMPLE(4); SAMPLE(5); SAMPLE(6); SAMPLE(7);                         // (Samples should stay in register.)
    
    int16_t mix = (MIX(0) + MIX(1) + MIX(2) + MIX(3)) >> 1;             // Apply xor, modulate by amp, and mix.
    mix += (MIX(4) + MIX(5) + MIX(6) + MIX(7)) >> 1;

#ifdef DAC
    while (!(SPSR & _BV(SPIF)));                                        // SPI transfer should already be finished (i.e., loop exits immediately).
    SPDR = wavOut;                                                      // Begin transmitting the lower 8-bits.
#endif

    PHASE(8); PHASE(9); PHASE(10); PHASE(11);                           // Advance the Q8.8 phase and calculate the 8-bit offsets into the wavetable.
    PHASE(12); PHASE(13); PHASE(14); PHASE(15);                         // (Load stores should use constant offsets and results should stay in register.)
    
    SAMPLE(8); SAMPLE(9); SAMPLE(10); SAMPLE(11);                       // Sample the wavetables at the offsets calculated above.
    SAMPLE(12); SAMPLE(13); SAMPLE(14); SAMPLE(15);                     // (Samples should stay in register.)
    
    mix += (MIX(8) + MIX(9) + MIX(10) + MIX(11)) >> 1;                  // Apply xor, modulate by amp, and mix.
    mix += (MIX(12) + MIX(13) + MIX(14) + MIX(15)) >> 1;
    
    wavOut = mix + 0x8000;                                              // Store resulting wave output for transmission on next interrupt.

#ifdef DAC
    while (!(SPSR & _BV(SPIF)));                                        // SPI transfer should already be finished (i.e., loop exits immediately).
    PORTB |= _BV(DDB2);
#else
    wavOut >>= 2;

    OCR1B = wavOut >> 7;
    OCR1A = wavOut & 0x7F;
#endif

    TIMSK2 = _BV(OCIE2A);                                               // Restore timer2 interrupts.
}

#ifdef __EMSCRIPTEN__
uint16_t Synth::sample() {
	TIMER2_COMPA_vect();
	return wavOut;
}
#endif // __EMSCRIPTEN__

// Returns the next idle voice, if any.  If no voice is idle, uses ADSR stage and amplitude to
// choose the best candidate for note-stealing.
uint8_t Synth::getNextVoice() {
    uint8_t current = maxVoice;   
	uint8_t currentStage;
	int8_t currentAmp;
	
	{
		const volatile Lerp& currentMod		= v_ampMod[current];
		currentStage = currentMod.stageIndex;
		currentAmp = currentMod.amp;
	}

    for (int8_t candidate = maxVoice - 1; candidate >= 0; candidate--) {
        const volatile Lerp& candidateMod   = v_ampMod[candidate];
        const uint8_t candidateStage = candidateMod.stageIndex;
        
        if (candidateStage >= currentStage) {                                  // If the currently chosen voice is in a later ADSR stage, keep it.
            if (candidateStage == currentStage) {                              // Otherwise, if both voices are in the same ADSR stage
                const int8_t candidateAmp = candidateMod.amp;                  //   compare amplitudes to determine which voice to steal.
            
                bool selectCandidate = candidateMod.slope > 0                  // If amplitude is increasing...
                    ? candidateAmp >= currentAmp                               //   steal the lower amplitude voice
                    : candidateAmp <= currentAmp;                              //   otherwise the higher amplitude voice

                if (selectCandidate) {
                    current = candidate;
					currentStage = candidateStage;
					currentAmp = candidateAmp;
                }
            } else {
                current = candidate;											// Else, if the candidate is in a later ADSR stage, steal it.
				currentStage = candidateStage;
				currentAmp = candidateMod.amp;
            }
        }
    }
    
    return current;
}

constexpr uint8_t offsetTable[] = { 0, 0, 1, 1, 2, 3, 3, 3 };

void Synth::noteOn(uint8_t voice, uint8_t note, uint8_t midiVelocity, const Instrument& instrument) {
	const uint8_t flags = instrument.flags;
    if (flags & InstrumentFlags_HalfAmplitude) {
        midiVelocity >>= 1;
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

    uint16_t pitch = pgm_read_word(&_midiToPitch[note]);
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
    v_vol[voice] = midiVelocity;
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
    uint16_t hi, lo;

    if (value > 0) {
        lo = pitch;
        hi = pgm_read_word(&_midiToPitch[_note[voice] + 2]);
    } else {
        lo = pgm_read_word(&_midiToPitch[_note[voice] - 2]);
        hi = pitch;
    }

    int32_t delta = hi - lo;
    pitch += static_cast<int16_t>((delta * value) / 0x2000);

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
    PORTB |= _BV(DDB2);                 // Set CS pin HIGH
    DDRB |= _BV(DDB2);                  // Set CS pin as output.
    
    SPSR |= _BV(SPI2X);                 // SCK = F_CPU/2
    SPCR = _BV(SPE) | _BV(MSTR);        // Enable SPI, Master
    
    DDRB |= _BV(DDB5) | _BV(DDB3);      // Set MOSI and SCK as outputs after enabling SPI.
#else
    TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM11);    // Toggle OC1A/OC1B on Compare Match, Fast PWM
    TCCR1B = _BV(WGM13) | _BV(WGM12) | _BV(CS10);       // Fast PWM, Top ICR1H/L, Prescale None
    ICR1H = 0;
    ICR1L = 0x7F;                                       // Top = 127 (7-bit PWM per output)
    DDRB |= _BV(DDB1) | _BV(DDB2);                      // Output PWM to DDB1 / DDB2
	DDRC |= _BV(DDC0) | _BV(DDC1);						// Output top 2 bits to DDC0 / DDC1
    TIMSK1 = 0;
#endif

    TCCR2A = _BV(WGM21);                // CTC Mode (Clears timer and raises interrupt when OCR2B reaches OCR2A)
    TCCR2B = _BV(CS21);                 // Prescale None = C_FPU / 8 tick frequency
    OCR2A  = sampleDivider;             // Sample rate
#if DEBUG
    OCR2A  <<= 1;                       // Reduce sampling frequency by 1/2 in DEBUG (non-optimized) builds to
#endif                                  // avoid starving MIDI dispatch.
    TIMSK2 = _BV(OCIE2A);
}