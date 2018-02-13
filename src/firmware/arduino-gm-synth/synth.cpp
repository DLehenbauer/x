#include <avr/pgmspace.h>
#include <avr/io.h>
#include <avr/common.h>
#include <avr/interrupt.h>
#include <string.h>

#include "synth.h"

// Map MIDI notes [0..127] to the corresponding Q8.8 sampling interval at ~19.4 kHz
constexpr static uint16_t _midiToPitch[] PROGMEM = {
    0x001C, 0x001D, 0x001F, 0x0021, 0x0023, 0x0025, 0x0027, 0x0029, 0x002C, 0x002E, 0x0031, 0x0034, 0x0037, 0x003A, 0x003E, 0x0042,
    0x0046, 0x004A, 0x004E, 0x0053, 0x0058, 0x005D, 0x0062, 0x0068, 0x006E, 0x0075, 0x007C, 0x0083, 0x008B, 0x0093, 0x009C, 0x00A5,
    0x00AF, 0x00BA, 0x00C5, 0x00D0, 0x00DD, 0x00EA, 0x00F8, 0x0107, 0x0116, 0x0127, 0x0138, 0x014B, 0x015E, 0x0173, 0x0189, 0x01A1,
    0x01BA, 0x01D4, 0x01F0, 0x020D, 0x022C, 0x024D, 0x0270, 0x0296, 0x02BD, 0x02E7, 0x0313, 0x0341, 0x0373, 0x03A8, 0x03DF, 0x041A,
    0x0459, 0x049B, 0x04E1, 0x052B, 0x057A, 0x05CD, 0x0625, 0x0683, 0x06E6, 0x074F, 0x07BE, 0x0834, 0x08B1, 0x0935, 0x09C2, 0x0A56,
    0x0AF3, 0x0B9A, 0x0C4B, 0x0D06, 0x0DCC, 0x0E9E, 0x0F7D, 0x1068, 0x1162, 0x126B, 0x1383, 0x14AC, 0x15E7, 0x1734, 0x1895, 0x1A0C,
    0x1B98, 0x1D3C, 0x1EF9, 0x20D1, 0x22C4, 0x24D5, 0x2706, 0x2958, 0x2BCD, 0x2E68, 0x312B, 0x3417, 0x3730, 0x3A78, 0x3DF2, 0x41A1,
    0x4588, 0x49AB, 0x4E0C, 0x52B0, 0x579B, 0x5CD0, 0x6255, 0x682E, 0x6E60, 0x74F0, 0x7BE4, 0x8342, 0x8B10, 0x9355, 0x9C18, 0xA560
};

volatile const int8_t*  v_wave[Synth::numVoices]    = { 0 };        // Starting address of 256b wave table.
volatile uint16_t       v_phase[Synth::numVoices]   = { 0 };        // Phase accumulator holding the Q8.8 offset of the next sample.
volatile uint16_t       v_pitch[Synth::numVoices]   = { 0 };        // Q8.8 sampling period, used to advance the '_phase' accumulator.
volatile int8_t         v_xor[Synth::numVoices]     = { 0 };        // XOR bits applied to each sample (for effect).
volatile uint8_t        v_amp[Synth::numVoices]     = { 0 };        // 6-bit amplitude scale applied to each sample.
volatile bool           v_isNoise[Synth::numVoices] = { 0 };        // If true, '_xor' is periodically overwritten with random values.

volatile ADSR           v_adsr[Synth::numVoices]    = {};           // ADSR generator for amplitude.
volatile uint8_t        v_vol[Synth::numVoices]     = { 0 };        // 7-bit volume scalar applied to ADSR output.

volatile uint16_t _basePitch[Synth::numVoices]      = { 0 };                            // Original Q8.8 sampling period, prior to modulation, pitch bend, etc.
volatile uint8_t       _note[Synth::numVoices]      = { 0 };                            // Index of '_basePitch' in the '_pitches' table, used for pitch bend calculation.
volatile InstrumentFlags _voiceFlags[Synth::numVoices] = { InstrumentFlags_None };      // InstrumentFlags are misc. behavior modifiers.

#ifdef WAVE_EDIT
uint8_t        v_waveform[256]                      = { 0 };
#endif

SIGNAL(TIMER2_COMPA_vect) {
    TIMSK2 = 0;         // Disable timer2 interrupts to prevent reentrancy.
    sei();              // Re-enable interrupts to ensure we do not miss MIDI events.
    
    {
        static uint16_t noise = 0xACE1;                     // 16-bit maximal-period Galois LFSR
        noise = (noise >> 1) ^ (-(noise & 1) & 0xB400);     // https://en.wikipedia.org/wiki/Linear-feedback_shift_register#Galois_LFSRs
        
        static uint8_t divider = 0;                         // Time division is used to spread lower-frequency / periodic work
        divider++;                                          // across interrupts.
        
        const uint8_t voice = divider & 0x0F;               // Bottom 4 bits of 'divider' selects which voice to perform work on.
        
        if (v_isNoise[voice]) {                              // To avoid needing a large wavetable for noise, we use xor to combine
            v_xor[voice] = static_cast<uint8_t>(noise);      // the a 256B wavetable with samples from the LFSR.
        }

        const uint8_t fn = divider & 0xF0;                  // Top 4 bits of 'divider' selects which additional work to perform.
        switch (fn) {
            case 0x00:
            case 0x50:
			case 0xA0: {                                    // Advance the ADSR and update '_amp' for the current voice.
                uint16_t amp = v_adsr[voice].sample();
                v_amp[voice] = (amp * v_vol[voice]) >> 8;
                break;
            }
        }
    }

    // Each interrupt, we transmit the previous output to the DAC concurrently with calculating
    // the next wavOut.  This avoids unproductive busy-waiting for SPI to finish.
    
    static uint16_t wavOut = 0x8000;                                    // Audio output calculated by previous ISR as
                                                                        // biased/unsigned (0 signed -> 0x8000).
    
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

#ifdef __EMSCRIPTEN__
	retValFromSample = wavOut;
#else
#ifdef DAC
    while (!(SPSR & _BV(SPIF)));                                        // SPI transfer should already be finished (i.e., loop exits immediately).
    PORTB |= _BV(DDB2);
#else
    wavOut >>= 2;

    OCR1B = wavOut >> 7;
    OCR1A = wavOut & 0x7F;
#endif
#endif    
    TIMSK2 = _BV(OCIE2A);                                               // Restore timer2 interrupts.
}

// Returns the next idle voice, if any.  If no voice is idle, uses ADSR stage and amplitude to
// choose the best candidate for note-stealing.
uint8_t Synth::getNextVoice() {
    uint8_t voice = maxVoice;   
    for (int8_t candidate = maxVoice - 1; candidate >= 0; candidate--) {
        const volatile ADSR& left   = v_adsr[candidate];
        const volatile ADSR& right  = v_adsr[voice];

        const int8_t leftStage = left.stage;
        const int8_t rightStage = right.stage;
        
        if (leftStage >= rightStage) {                                  // If the currently chosen voice is in a later ADSR stage, keep it.
            if (leftStage == rightStage) {                              // Otherwise, if both voices are in the same ADSR stage
                const int8_t leftAmp = left.amp;                        //   compare amplitudes to determine which voice to steal.
                const int8_t rightAmp = right.amp;
            
                bool selectCandidate = leftStage == ADSRStage_Attack    // If attacking...
                    ? leftAmp >= rightAmp                               //   steal the lower amplitude voice
                    : leftAmp <= rightAmp;                              //   otherwise the higher amplitude voice

                if (selectCandidate) {
                    voice = candidate;
                }
            } else {
                voice = candidate;                                      // Else, if the candidate is in a later ADSR stage, steal it.
            }
        }
    }
    
    return voice;
}

void Synth::noteOn(uint8_t voice, uint8_t note, uint8_t midiVelocity, const Instrument& instrument) {
    if (instrument.flags & InstrumentFlags_HalfAmplitude) {
        midiVelocity >>= 1;
    }
    _voiceFlags[voice] = instrument.flags;
    
    bool isNoise = instrument.flags & InstrumentFlags_Noise;

    _note[voice] = note;

    uint16_t pitch = pgm_read_word(&_midiToPitch[note]);
    _basePitch[voice] = pitch;

    // Suspend audio processing before updating state shared with the ISR.
    suspend();

    v_wave[voice] = instrument.wave;
    v_phase[voice] = 0;
    v_pitch[voice] = pitch;
    v_xor[voice] = instrument.xorBits;
    v_amp[voice] = 0;
    v_isNoise[voice] = isNoise;
    v_adsr[voice].parameters = &instrument.adsr;
    v_vol[voice] = midiVelocity;
    v_adsr[voice].noteOn();
    
    resume();
}

void Synth::noteOff(uint8_t voice) {
    bool isDamped = _voiceFlags[voice] & InstrumentFlags_Damped;

    // Suspend audio processing before updating state shared with the ISR.
    suspend();
    v_adsr[voice].noteOff(isDamped);
    resume();
}

void Synth::pitchBend(uint8_t voice, int16_t value) {
    uint16_t pitch = _basePitch[voice];
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
    v_pitch[voice] = pitch;
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
    OCR2A  = 0x67;                      // ~19.4 kHz sampling/mixing frequency
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