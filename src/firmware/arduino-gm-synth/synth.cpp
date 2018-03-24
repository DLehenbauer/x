#include <avr/pgmspace.h>
#include <avr/io.h>
#include <avr/common.h>
#include <avr/interrupt.h>
#include <string.h>

#include "synth.h"
#include "lerp.h"

// Map MIDI notes [0..127] to the corresponding Q8.8 sampling interval at ~20 kHz
constexpr static uint16_t _midiToPitch[] PROGMEM = {
	0x001B, 0x001D, 0x001E, 0x0020, 0x0022, 0x0024, 0x0026, 0x0029, 0x002B, 0x002E, 0x0030, 0x0033, 0x0036, 0x0039, 0x003D, 0x0040,
	0x0044, 0x0048, 0x004D, 0x0051, 0x0056, 0x005B, 0x0060, 0x0066, 0x006C, 0x0073, 0x0079, 0x0081, 0x0088, 0x0090, 0x0099, 0x00A2,
	0x00AC, 0x00B6, 0x00C1, 0x00CC, 0x00D8, 0x00E5, 0x00F3, 0x0101, 0x0111, 0x0121, 0x0132, 0x0144, 0x0158, 0x016C, 0x0182, 0x0199,
	0x01B1, 0x01CB, 0x01E6, 0x0203, 0x0221, 0x0242, 0x0264, 0x0289, 0x02AF, 0x02D8, 0x0303, 0x0331, 0x0362, 0x0395, 0x03CC, 0x0406,
	0x0443, 0x0484, 0x04C9, 0x0511, 0x055E, 0x05B0, 0x0607, 0x0663, 0x06C4, 0x072B, 0x0798, 0x080B, 0x0886, 0x0908, 0x0991, 0x0A23,
	0x0ABD, 0x0B60, 0x0C0E, 0x0CC5, 0x0D87, 0x0E55, 0x0F30, 0x1017, 0x110C, 0x120F, 0x1322, 0x1445, 0x157A, 0x16C1, 0x181B, 0x198A,
	0x1B0F, 0x1CAB, 0x1E5F, 0x202D, 0x2217, 0x241E, 0x2644, 0x288B, 0x2AF4, 0x2D82, 0x3036, 0x3314, 0x361E, 0x3955, 0x3CBE, 0x405B,
	0x442F, 0x483C, 0x4C88, 0x5115, 0x55E7, 0x5B03, 0x606C, 0x6628, 0x6C3B, 0x72AB, 0x797C, 0x80B6, 0x885D, 0x9079, 0x9910, 0xA22A,
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

#ifdef WAVE_EDIT
uint8_t        v_waveform[256]                      = { 0 };
#endif

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
			
			case 0x80: {
				int8_t waveMod = (v_waveMod[voice].sample());
				v_wave[voice] = v_baseWave[voice] + waveMod;
				break;
			}

            case 0x40:
			case 0xC0: {                                    // Advance the ADSR and update '_amp' for the current voice.
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

#ifndef WAVE_EDIT
    // Macro that samples the wavetable at the offset '_wave[voice] + offset##voice', and stores as 'sample##voice'.
    #define SAMPLE(voice) int8_t sample##voice = (pgm_read_byte(v_wave[voice] + offset##voice))
#else
    // Macro that samples the 256B wave buffer at offset 'offset##voice', and stores as 'sample##voice'.
    #define SAMPLE(voice) int8_t sample##voice = (v_waveform[offset##voice])
#endif

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

void Synth::noteOn(uint8_t voice, uint8_t note, uint8_t midiVelocity, const Instrument& instrument) {
	const uint8_t flags = instrument.flags;
    if (flags & InstrumentFlags_HalfAmplitude) {
        midiVelocity >>= 1;
    }
    
    bool isNoise = flags & InstrumentFlags_Noise;
	
	uint8_t ampMod = instrument.ampMod;
	if (flags & InstrumentFlags_SelectWave) {
		if (note > 60) {
			ampMod += 2;
			if (ampMod > 84) {
				ampMod++;
			}
		}
		else if (note > 36) { ampMod++; }
	}

	const int8_t* wave = instrument.wave;
	if (flags & InstrumentFlags_SelectAmplitude) {
		if (note > 60) {
			wave += 128;
			if (ampMod > 84) {
				wave += 64;
			}
		}
		else if (note > 36) { wave += 64; }
	}

    _note[voice] = note;

    uint16_t pitch = pgm_read_word(&_midiToPitch[note]);
#if DEBUG
	pitch <<= 1;						// Reduce sampling frequency by 1/2 in DEBUG (non-optimized) builds to
#endif                                  // avoid starving MIDI dispatch.
    // Suspend audio processing before updating state shared with the ISR.
    suspend();

    v_wave[voice] = v_baseWave[voice] = wave;
    v_phase[voice] = 0;
    v_pitch[voice] = v_bentPitch[voice] = v_basePitch[voice] = pitch;
    v_xor[voice] = instrument.xorBits;
    v_amp[voice] = 0;
    v_isNoise[voice] = isNoise;
    v_vol[voice] = midiVelocity;
    v_ampMod[voice].start(ampMod,			   /* init */ 0x00);
	v_freqMod[voice].start(instrument.freqMod, /* init */ 0x40);
	v_waveMod[voice].start(instrument.waveMod, /* init */ 0x00);
    
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

void Synth::setWaveform(uint8_t start, uint8_t bytes[], uint8_t length) {
#ifdef WAVE_EDIT
    memcpy(&v_waveform[start], bytes, length);
#endif
}