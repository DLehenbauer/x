#ifndef __SYNTH_H__
#define __SYNTH_H__

#include <avr/interrupt.h>
#include <avr/pgmspace.h>
#include <math.h>
#include <stdint.h>
#include "instruments.h"
#include "envelope.h"
#include "drivers/dac/ltc16xx.h"
#include "drivers/dac/pwm0.h"
#include "drivers/dac/pwm01.h"
#include "drivers/dac/pwm1.h"

#ifndef __EMSCRIPTEN__
constexpr static uint16_t pitch(double sampleRate, double note) {
  return round(pow(2, (note - 69.0) / 12.0) * 440.0 / sampleRate * static_cast<double>(0xFFFF));
}
#endif

class Synth {
  public:
    constexpr static uint8_t numVoices = 16;
    constexpr static uint8_t maxVoice = Synth::numVoices - 1;
    constexpr static uint8_t samplingInterval = 0x65
  #if DEBUG
      >> 1	// On Debug, halve sampling interval to avoid starving MIDI dispatch.
  #endif
      ;
  
  constexpr static double sampleRate = static_cast<double>(F_CPU) / 8.0 / static_cast<double>(Synth::samplingInterval);
  
  private:
    static constexpr uint8_t offsetTable[] = { 0, 0, 1, 1, 2, 3, 3, 3 };

    // Map MIDI notes [0..127] to the corresponding Q8.8 sampling interval
    constexpr static uint16_t _noteToPitch[] PROGMEM = {
    #ifndef __EMSCRIPTEN__
      pitch(sampleRate, 0x00), pitch(sampleRate, 0x01), pitch(sampleRate, 0x02), pitch(sampleRate, 0x03), pitch(sampleRate, 0x04), pitch(sampleRate, 0x05), pitch(sampleRate, 0x06), pitch(sampleRate, 0x07),
      pitch(sampleRate, 0x08), pitch(sampleRate, 0x09), pitch(sampleRate, 0x0A), pitch(sampleRate, 0x0B), pitch(sampleRate, 0x0C), pitch(sampleRate, 0x0D), pitch(sampleRate, 0x0E), pitch(sampleRate, 0x0F),
      pitch(sampleRate, 0x10), pitch(sampleRate, 0x11), pitch(sampleRate, 0x12), pitch(sampleRate, 0x13), pitch(sampleRate, 0x14), pitch(sampleRate, 0x15), pitch(sampleRate, 0x16), pitch(sampleRate, 0x17),
      pitch(sampleRate, 0x18), pitch(sampleRate, 0x19), pitch(sampleRate, 0x1A), pitch(sampleRate, 0x1B), pitch(sampleRate, 0x1C), pitch(sampleRate, 0x1D), pitch(sampleRate, 0x1E), pitch(sampleRate, 0x1F),
      pitch(sampleRate, 0x20), pitch(sampleRate, 0x21), pitch(sampleRate, 0x22), pitch(sampleRate, 0x23), pitch(sampleRate, 0x24), pitch(sampleRate, 0x25), pitch(sampleRate, 0x26), pitch(sampleRate, 0x27),
      pitch(sampleRate, 0x28), pitch(sampleRate, 0x29), pitch(sampleRate, 0x2A), pitch(sampleRate, 0x2B), pitch(sampleRate, 0x2C), pitch(sampleRate, 0x2D), pitch(sampleRate, 0x2E), pitch(sampleRate, 0x2F),
      pitch(sampleRate, 0x30), pitch(sampleRate, 0x31), pitch(sampleRate, 0x32), pitch(sampleRate, 0x33), pitch(sampleRate, 0x34), pitch(sampleRate, 0x35), pitch(sampleRate, 0x36), pitch(sampleRate, 0x37),
      pitch(sampleRate, 0x38), pitch(sampleRate, 0x39), pitch(sampleRate, 0x3A), pitch(sampleRate, 0x3B), pitch(sampleRate, 0x3C), pitch(sampleRate, 0x3D), pitch(sampleRate, 0x3E), pitch(sampleRate, 0x3F),
      pitch(sampleRate, 0x40), pitch(sampleRate, 0x41), pitch(sampleRate, 0x42), pitch(sampleRate, 0x43), pitch(sampleRate, 0x44), pitch(sampleRate, 0x45), pitch(sampleRate, 0x46), pitch(sampleRate, 0x47),
      pitch(sampleRate, 0x48), pitch(sampleRate, 0x49), pitch(sampleRate, 0x4A), pitch(sampleRate, 0x4B), pitch(sampleRate, 0x4C), pitch(sampleRate, 0x4D), pitch(sampleRate, 0x4E), pitch(sampleRate, 0x4F),
      pitch(sampleRate, 0x50), pitch(sampleRate, 0x51), pitch(sampleRate, 0x52), pitch(sampleRate, 0x53), pitch(sampleRate, 0x54), pitch(sampleRate, 0x55), pitch(sampleRate, 0x56), pitch(sampleRate, 0x57),
      pitch(sampleRate, 0x58), pitch(sampleRate, 0x59), pitch(sampleRate, 0x5A), pitch(sampleRate, 0x5B), pitch(sampleRate, 0x5C), pitch(sampleRate, 0x5D), pitch(sampleRate, 0x5E), pitch(sampleRate, 0x5F),
      pitch(sampleRate, 0x60), pitch(sampleRate, 0x61), pitch(sampleRate, 0x62), pitch(sampleRate, 0x63), pitch(sampleRate, 0x64), pitch(sampleRate, 0x65), pitch(sampleRate, 0x66), pitch(sampleRate, 0x67),
      pitch(sampleRate, 0x68), pitch(sampleRate, 0x69), pitch(sampleRate, 0x6A), pitch(sampleRate, 0x6B), pitch(sampleRate, 0x6C), pitch(sampleRate, 0x6D), pitch(sampleRate, 0x6E), pitch(sampleRate, 0x6F),
      pitch(sampleRate, 0x70), pitch(sampleRate, 0x71), pitch(sampleRate, 0x72), pitch(sampleRate, 0x73), pitch(sampleRate, 0x74), pitch(sampleRate, 0x75), pitch(sampleRate, 0x76), pitch(sampleRate, 0x77),
      pitch(sampleRate, 0x78), pitch(sampleRate, 0x79), pitch(sampleRate, 0x7A), pitch(sampleRate, 0x7B), pitch(sampleRate, 0x7C), pitch(sampleRate, 0x7D), pitch(sampleRate, 0x7E), pitch(sampleRate, 0x7F),
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

    static volatile const int8_t*	v_wave[Synth::numVoices];			  // Starting address of 256b wave table.
    static volatile uint16_t		  v_phase[Synth::numVoices];			// Phase accumulator holding the Q8.8 offset of the next sample.
    static volatile uint16_t		  v_pitch[Synth::numVoices];			// Q8.8 sampling period, used to advance the '_phase' accumulator.
    static volatile int8_t			  v_xor[Synth::numVoices];			  // XOR bits applied to each sample (for effect).
    static volatile uint8_t			  v_amp[Synth::numVoices];			  // 6-bit amplitude scale applied to each sample.
    static volatile bool			    v_isNoise[Synth::numVoices];		// If true, '_xor' is periodically overwritten with random values.

    static volatile Envelope			v_ampMod[Synth::numVoices];     // Amplitude modulation
    static volatile Envelope			v_freqMod[Synth::numVoices];		// Frequency modulation
    static volatile Envelope			v_waveMod[Synth::numVoices];		// Wave offset modulation

    static volatile uint8_t			  v_vol[Synth::numVoices];			  // 7-bit volume scalar applied to ADSR output.

    static volatile uint16_t		  v_basePitch[Synth::numVoices];	// Original Q8.8 sampling period, prior to modulation, pitch bend, etc.
    static volatile uint16_t		  v_bentPitch[Synth::numVoices];	// Q8.8 sampling post pitch bend, but prior to freqMod.
    static volatile const int8_t*	v_baseWave[Synth::numVoices];		// Original starting address in wavetable.
    static volatile uint8_t			  _note[Synth::numVoices];			  // Index of '_basePitch' in the '_pitches' table, used for pitch bend calculation.
  
    static DAC _dac;
  
  public:
    void begin(){
      _dac.setup();

      // Setup Timer2 for sample/mix/output ISR.
      TCCR2A = _BV(WGM21);                // CTC Mode (Clears timer and raises interrupt when OCR2B reaches OCR2A)
      TCCR2B = _BV(CS21);                 // Prescale None = C_FPU / 8 tick frequency
      OCR2A  = samplingInterval;			    // Set timer top to sampling interval
      TIMSK2 = _BV(OCIE2A);               // Enable ISR
    }
  
    // Returns the next idle voice, if any.  If no voice is idle, uses envelope stage and amplitude to
    // choose the best candidate for note-stealing.
    uint8_t getNextVoice() {
      uint8_t current = maxVoice;
      uint8_t currentStage;
      int8_t currentAmp;
    
      {
        const volatile Envelope& currentMod	= v_ampMod[current];
        currentStage = currentMod.stageIndex;
        currentAmp = currentMod.amp;
      }

      for (uint8_t candidate = maxVoice - 1; candidate < maxVoice; candidate--) {
        const volatile Envelope& candidateMod = v_ampMod[candidate];
        const uint8_t candidateStage = candidateMod.stageIndex;
      
        if (candidateStage >= currentStage) {                 // If the currently chosen voice is in a later amplitude stage, keep it.
          if (candidateStage == currentStage) {               // Otherwise, if both voices are in the same amplitude stage
            const int8_t candidateAmp = candidateMod.amp;     //   compare amplitudes to determine which voice to prefer.
          
            bool selectCandidate = candidateMod.slope >= 0    // If amplitude is increasing...
              ? candidateAmp >= currentAmp							      //   prefer the lower amplitude voice
              : candidateAmp <= currentAmp;							      //   otherwise the higher amplitude voice

            if (selectCandidate) {
              current = candidate;
              currentStage = candidateStage;
              currentAmp = candidateAmp;
            }
          } else {
            current = candidate;										          // Else, if the candidate is in a later ADSR stage, prefer it.
            currentStage = candidateStage;
            currentAmp = candidateMod.amp;
          }
        }
      }
    
      return current;
    }

    void noteOn(uint8_t voice, uint8_t note, uint8_t velocity, const Instrument& instrument) {
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

      // Suspend audio processing before updating state shared with the ISR.
      suspend();

      v_wave[voice] = v_baseWave[voice] = instrument.wave + waveOffset;
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

    void noteOff(uint8_t voice) {
      // Suspend audio processing before updating state shared with the ISR.
      suspend();
      v_ampMod[voice].stop();
      resume();
    }
  
    void pitchBend(uint8_t voice, int16_t value) {
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
  
    uint8_t getAmp(uint8_t voice) const {
      return v_amp[voice];
    }
  
    static uint16_t isr() __attribute__((always_inline)) {
      TIMSK2 = 0;         // Disable timer2 interrupts to prevent reentrancy.
      sei();              // Re-enable interrupts to ensure USART RX ISR buffers incoming MIDI messages.
    
      {
        static uint16_t noise = 0xACE1;                   // 16-bit maximal-period Galois LFSR
        noise = (noise >> 1) ^ (-(noise & 1) & 0xB400);   // https://en.wikipedia.org/wiki/Linear-feedback_shift_register#Galois_LFSRs
      
        static uint8_t divider = 0;                       // Time division is used to spread lower-frequency / periodic work
        divider++;                                        // across interrupts.
      
        const uint8_t voice = divider & 0x0F;				      // Bottom 4 bits of 'divider' selects which voice to perform work on.
      
        if (v_isNoise[voice]) {                           // To avoid needing a large wavetable for noise, we use xor to combine
          v_xor[voice] = static_cast<uint8_t>(noise);     // the a 256B wavetable with samples from the LFSR.
        }

        const uint8_t fn = divider & 0xF0;                // Top 4 bits of 'divider' selects which additional work to perform.
        switch (fn) {
          case 0x00: {									                  // Advance frequency modulation and update 'v_pitch' for the current voice.
            int8_t freqMod = (v_freqMod[voice].sample() - 0x40);
            v_pitch[voice] = v_bentPitch[voice] + freqMod;
            break;
          }
        
          case 0x50: {									                  // Advance wave modulation and update 'v_wave' for the current voice.
            int8_t waveMod = (v_waveMod[voice].sample());
            v_wave[voice] = v_baseWave[voice] + waveMod;
            break;
          }

          case 0xA0: {                                    // Advance the amplitude modulation and update 'v_amp' for the current voice.
            uint16_t amp = v_ampMod[voice].sample();
            v_amp[voice] = (amp * v_vol[voice]) >> 8;
            break;
          }
        }
      }

      // Each interrupt, we transmit the previous output to the DAC concurrently with calculating
      // the next wavOut.  This avoids unproductive busy-waiting for SPI to finish.
      _dac.sendHiByte();										                                // Begin transmitting upper 8-bits to DAC.

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
    
      SAMPLE(0); SAMPLE(1); SAMPLE(2); SAMPLE(3);                         // Sample the wavetable at the offsets calculated above.
      SAMPLE(4); SAMPLE(5); SAMPLE(6); SAMPLE(7);                         // (Samples should stay in register.)
    
      int16_t mix = (MIX(0) + MIX(1) + MIX(2) + MIX(3)) >> 1;             // Apply xor, modulate by amp, and mix.
      mix += (MIX(4) + MIX(5) + MIX(6) + MIX(7)) >> 1;

      _dac.sendLoByte();													                        // Begin transmitting the lower 8-bits.

      PHASE(8); PHASE(9); PHASE(10); PHASE(11);                           // Advance the Q8.8 phase and calculate the 8-bit offsets into the wavetable.
      PHASE(12); PHASE(13); PHASE(14); PHASE(15);                         // (Load stores should use constant offsets and results should stay in register.)
    
      SAMPLE(8); SAMPLE(9); SAMPLE(10); SAMPLE(11);                       // Sample the wavetable at the offsets calculated above.
      SAMPLE(12); SAMPLE(13); SAMPLE(14); SAMPLE(15);                     // (Samples should stay in register.)
    
      mix += (MIX(8) + MIX(9) + MIX(10) + MIX(11)) >> 1;                  // Apply xor, modulate by amp, and mix.
      mix += (MIX(12) + MIX(13) + MIX(14) + MIX(15)) >> 1;

      #undef MIX
      #undef SAMPLE
      #undef PHASE
    
      const uint16_t wavOut = mix + 0x8000;
      _dac.set(wavOut);													                          // Store resulting wave output for transmission on next interrupt.
    
      TIMSK2 = _BV(OCIE2A);                                               // Restore timer2 interrupts.
    
      return wavOut;
    }

  
    // Suspends audio processing ISR.  While suspended, it is safe to update of volatile state
    // shared with the ISR and to communicate with other SPI devices.
    void suspend() __attribute__((always_inline)) {
      cli();
      TIMSK2 = 0;
      sei();
    }
  
    // Resumes audio processing ISR.
    void resume() __attribute__((always_inline)) {
      TIMSK2 = _BV(OCIE2A);
    }
  
    #ifdef __EMSCRIPTEN__
    Instrument instrument0;

    void noteOnEm(uint8_t voice, uint8_t note, uint8_t velocity, uint8_t instrumentIndex) {
      Instruments::getInstrument(instrumentIndex, instrument0);
      this->noteOn(voice, note, velocity, instrument0);
    }
    #endif // __EMSCRIPTEN__
};

constexpr uint16_t Synth::_noteToPitch[] PROGMEM;							// Map MIDI notes [0..127] to the corresponding Q8.8 sampling interval
constexpr uint8_t Synth::offsetTable[];
DAC Synth::_dac;

volatile const int8_t*  Synth::v_wave[Synth::numVoices]       = { 0 };	// Starting address of 256b wave table.
volatile uint16_t       Synth::v_phase[Synth::numVoices]      = { 0 };	// Phase accumulator holding the Q8.8 offset of the next sample.
volatile uint16_t       Synth::v_pitch[Synth::numVoices]      = { 0 };	// Q8.8 sampling period, used to advance the '_phase' accumulator.
volatile int8_t         Synth::v_xor[Synth::numVoices]        = { 0 };	// XOR bits applied to each sample (for effect).
volatile uint8_t        Synth::v_amp[Synth::numVoices]        = { 0 };	// 6-bit amplitude scale applied to each sample.
volatile bool           Synth::v_isNoise[Synth::numVoices]    = { 0 };	// If true, '_xor' is periodically overwritten with random values.

volatile Envelope       Synth::v_ampMod[Synth::numVoices]     = {};			// Amplitude modulation
volatile Envelope       Synth::v_freqMod[Synth::numVoices]    = {};			// Frequency modulation
volatile Envelope       Synth::v_waveMod[Synth::numVoices]    = {};			// Wave offset modulation

volatile uint8_t        Synth::v_vol[Synth::numVoices]        = { 0 };	// 7-bit volume scalar applied to ADSR output.

volatile uint16_t		    Synth::v_basePitch[Synth::numVoices]	= { 0 };	// Original Q8.8 sampling period, prior to modulation, pitch bend, etc.
volatile uint16_t		    Synth::v_bentPitch[Synth::numVoices]	= { 0 };	// Q8.8 sampling post pitch bend, but prior to freqMod.
volatile const int8_t*  Synth::v_baseWave[Synth::numVoices]	  = { 0 };  // Original starting address in wavetable.
volatile uint8_t		    Synth::_note[Synth::numVoices]			  = { 0 };  // Index of '_basePitch' in the '_pitches' table, used for pitch bend calculation.

SIGNAL(TIMER2_COMPA_vect) {
  Synth::isr();
}

#endif // __SYNTH_H__