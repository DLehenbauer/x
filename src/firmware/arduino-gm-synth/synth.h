#ifndef __SYNTH_H__
#define __SYNTH_H__

#include <avr/interrupt.h>
#include <avr/pgmspace.h>
#include <stdint.h>
#include "instruments.h"
#include "lerp.h"
#include "drivers/dac/ltc16xx.h"

#define DAC

#ifdef __EMSCRIPTEN__
	#define DAC
	void TIMER2_COMPA_vect();
#endif

class Synth {
    public:
		constexpr static uint8_t numVoices = 16;
		constexpr static uint8_t maxVoice = Synth::numVoices - 1;
		constexpr static uint8_t samplingInterval = 0x65;
		constexpr static double sampleRate = static_cast<double>(F_CPU) / 8.0 / static_cast<double>(Synth::samplingInterval);
		
	private:
		static volatile const int8_t*	v_wave[Synth::numVoices];			// Starting address of 256b wave table.
		static volatile uint16_t		v_phase[Synth::numVoices];			// Phase accumulator holding the Q8.8 offset of the next sample.
		static volatile uint16_t		v_pitch[Synth::numVoices];			// Q8.8 sampling period, used to advance the '_phase' accumulator.
		static volatile int8_t			v_xor[Synth::numVoices];			// XOR bits applied to each sample (for effect).
		static volatile uint8_t			v_amp[Synth::numVoices];			// 6-bit amplitude scale applied to each sample.
		static volatile bool			v_isNoise[Synth::numVoices];		// If true, '_xor' is periodically overwritten with random values.

		static volatile Lerp			v_ampMod[Synth::numVoices];         // Amplitude modulation
		static volatile Lerp			v_freqMod[Synth::numVoices];		// Frequency modulation
		static volatile Lerp			v_waveMod[Synth::numVoices];		// Wave offset modulation

		static volatile uint8_t			v_vol[Synth::numVoices];			// 7-bit volume scalar applied to ADSR output.

		static volatile uint16_t		v_basePitch[Synth::numVoices];		// Original Q8.8 sampling period, prior to modulation, pitch bend, etc.
		static volatile uint16_t		v_bentPitch[Synth::numVoices];		// Q8.8 sampling post pitch bend, but prior to freqMod.
		static volatile const int8_t*	v_baseWave[Synth::numVoices];		// Original starting address in wavetable.
		static volatile uint8_t			_note[Synth::numVoices];			// Index of '_basePitch' in the '_pitches' table, used for pitch bend calculation.
		
		static uint16_t wavOut;												// Audio output as biased/unsigned (0 signed -> 0x8000).
#ifdef DAC
		static Ltc16xx<PinId::D10> _dac;
#endif
	
	
	public:
        void begin();
        
		uint8_t getNextVoice();
        
		void noteOn(uint8_t voice, uint8_t note, uint8_t velocity, const Instrument& instrument);
        
		void noteOff(uint8_t voice);
        
		void pitchBend(uint8_t voice, int16_t value);
        
		uint8_t getAmp(uint8_t voice);
		
		static void isr() __attribute__((always_inline)) {
#ifndef DAC
			OCR0A = wavOut >> 8;		// Update PWM outputs prior to re-enabling interrupts to write OCR0A/B			OCR0B = wavOut & 0xFF;		// as atomically as possible.
#endif
			
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
					case 0x00: {									// Advance frequency modulation and update 'v_pitch' for the current voice.
						int8_t freqMod = (v_freqMod[voice].sample() - 0x40);
						v_pitch[voice] = v_bentPitch[voice] + freqMod;
						break;
					}
					
					case 0x50: {									// Advance wave modulation and update 'v_wave' for the current voice.
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
#ifdef DAC
			_dac.sendHiByte(wavOut >> 8);										// Begin transmitting upper 8-bits to DAC.
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
			_dac.sendLoByte(wavOut);											// Begin transmitting the lower 8-bits.
#endif

			PHASE(8); PHASE(9); PHASE(10); PHASE(11);                           // Advance the Q8.8 phase and calculate the 8-bit offsets into the wavetable.
			PHASE(12); PHASE(13); PHASE(14); PHASE(15);                         // (Load stores should use constant offsets and results should stay in register.)
			
			SAMPLE(8); SAMPLE(9); SAMPLE(10); SAMPLE(11);                       // Sample the wavetables at the offsets calculated above.
			SAMPLE(12); SAMPLE(13); SAMPLE(14); SAMPLE(15);                     // (Samples should stay in register.)
			
			mix += (MIX(8) + MIX(9) + MIX(10) + MIX(11)) >> 1;                  // Apply xor, modulate by amp, and mix.
			mix += (MIX(12) + MIX(13) + MIX(14) + MIX(15)) >> 1;
			
			wavOut = mix + 0x8000;                                              // Store resulting wave output for transmission on next interrupt.

#ifdef DAC
			_dac.end();															// Clear SPIF flag to avoid confusing other SPI users when returning from interrupt.
#endif
			
			TIMSK2 = _BV(OCIE2A);                                               // Restore timer2 interrupts.
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
		
		uint16_t sample();
#endif // __EMSCRIPTEN__
};

#endif // __SYNTH_H__