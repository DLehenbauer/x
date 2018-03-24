#ifndef __MIDISYNTH_H__
#define __MIDISYNTH_H__

#include <stdint.h>#include "synth.h"

class MidiSynth final : public Synth {
	private:
        constexpr static uint8_t numMidiChannels = 16;        constexpr static uint8_t percussionChannel = 9;
        uint8_t voiceToNote[Synth::numVoices];        uint8_t voiceToChannel[Synth::numVoices];        Instrument channelToInstrument[numMidiChannels];

    public:		MidiSynth() : Synth() {			for (int8_t channel = numMidiChannels; channel >= 0; channel--) {				Instruments::getInstrument(0, channelToInstrument[channel]);			}
			for (int8_t channel = Synth::maxVoice; channel >= 0; channel--) {				voiceToNote[channel] = 0xFF;				voiceToChannel[channel] = 0xFF;			}		}
		void midiNoteOn(uint8_t channel, uint8_t note, uint8_t velocity) {			if (channel == percussionChannel) {				uint8_t index = note - 35;				if (index >= 46) { index = 45; }
				note = Instruments::getPercussionNote(index);
				Instruments::getInstrument(0x80 + index, channelToInstrument[percussionChannel]);			}
			uint8_t voice = getNextVoice();			const Instrument& ch = channelToInstrument[channel];
			noteOn(voice, note, velocity, ch);
			voiceToNote[voice] = note;			voiceToChannel[voice] = channel;		}
		void midiNoteOff(uint8_t channel, uint8_t note)  {			for (int8_t voice = Synth::maxVoice; voice >= 0; voice--) {				if (voiceToNote[voice] == note && voiceToChannel[voice] == channel) {					noteOff(voice);					voiceToChannel[voice] = 0xFF;					voiceToNote[voice] = 0xFF;				}			}		}
		void midiProgramChange(uint8_t channel, uint8_t program) {			Instruments::getInstrument(program, channelToInstrument[channel]);		}
		void midiPitchBend(uint8_t channel, int16_t value) {			for (int8_t voice = Synth::maxVoice; voice >= 0; voice--) {				if (voiceToChannel[voice] == channel) {					pitchBend(voice, value);				}			}		}				void midiControlChange(uint8_t channel, uint8_t controller, uint8_t value) {			switch (controller) {
				case 0x7B: {
					switch (value) {
						case 0: {
							// All notes off
							for (int8_t voice = Synth::maxVoice; voice >= 0; voice--) {								if (voiceToChannel[voice] == channel) {									noteOff(voice);									voiceToChannel[voice] = 0xFF;									voiceToNote[voice] = 0xFF;								}							}							break;
						}
					}
				}
			}
		}
}; //MidiSynth

#endif //__MIDISYNTH_H__
