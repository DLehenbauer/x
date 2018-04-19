#ifndef __SYNTH_H__
#define __SYNTH_H__

#include <avr/interrupt.h>
#include <stdint.h>
#include "instruments.h"

//#define DAC

#ifdef __EMSCRIPTEN__
	#define DAC
	void TIMER2_COMPA_vect();
#endif

class Synth {
    public:
        constexpr static uint8_t numVoices = 16;
        constexpr static uint8_t maxVoice = Synth::numVoices - 1;
		constexpr static uint8_t sampleDivider = 0x65;
		constexpr static double sampleRate = static_cast<double>(F_CPU) / 8.0 / static_cast<double>(Synth::sampleDivider);

        void begin();
        uint8_t getNextVoice();
        void noteOn(uint8_t voice, uint8_t note, uint8_t midiVelocity, const Instrument& instrument);
        void noteOff(uint8_t voice);
        void pitchBend(uint8_t voice, int16_t value);
        bool isIdle(uint8_t voice);
        uint8_t getAmp(uint8_t voice);
        
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