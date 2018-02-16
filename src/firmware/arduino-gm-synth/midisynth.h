#ifndef __MIDISYNTH_H__
#define __MIDISYNTH_H__

#include <stdint.h>#include "synth.h"

class MidiSynth final : public Synth {
	private:
        constexpr static uint8_t numMidiChannels = 16;        constexpr static uint8_t percussionChannel = 9;
        uint8_t voiceToNote[numMidiChannels];        uint8_t voiceToChannel[numMidiChannels];        Instrument channels[16];

    public:		MidiSynth() : Synth() {			for (int8_t i = Synth::maxVoice; i >= 0; i--) {				Instruments::getInstrument(0, channels[i]);			}
			for (int8_t i = Synth::maxVoice; i >= 0; i--) {				voiceToNote[i] = 0xFF;				voiceToChannel[i] = 0xFF;			}		}
		void midiNoteOn(uint8_t channel, uint8_t note, uint8_t velocity) {			if (channel == percussionChannel) {				uint8_t index = note - 35;				if (index >= 46) { index = 45; }
				PercussiveInstrument drum;				Instruments::getDrum(index, drum);				note = drum.note;
				Instruments::getInstrument(0x80 + index, channels[9]);			}
			uint8_t voice = getNextVoice();			const Instrument& ch = channels[channel];
			noteOn(voice, note, velocity, ch);
			voiceToNote[voice] = note;			voiceToChannel[voice] = channel;		}
		void midiNoteOff(uint8_t channel, uint8_t note)  {			for (int8_t voice = Synth::maxVoice; voice >= 0; voice--) {				if (voiceToNote[voice] == note && voiceToChannel[voice] == channel) {					noteOff(voice);					voiceToChannel[voice] = 0xFF;					voiceToNote[voice] = 0xFF;				}			}		}
		void midiProgramChange(uint8_t channel, uint8_t program) {			Instruments::getInstrument(program, channels[channel]);		}
		void midiPitchBend(uint8_t midiChannel, int16_t value) {			for (int8_t voice = Synth::maxVoice; voice >= 0; voice--) {				if (voiceToChannel[voice] == midiChannel) {					pitchBend(voice, value);				}			}		}
}; //MidiSynth

#endif //__MIDISYNTH_H__
