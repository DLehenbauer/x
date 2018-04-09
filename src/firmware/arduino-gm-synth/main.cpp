#include <stdint.h>
#include "midi.h"
#include "midisynth.h"
#include "instruments.h"
#include "ssd1306.h"

#if X4
#define ATTACK_KNOB 0x07
#define DECAY_KNOB 0x0A
#define SUSTAIN_KNOB 0x0B
#define RELEASE_KNOB 0x5B
#else
#define ATTACK_KNOB 0x47
#define DECAY_KNOB 0x4A
#define SUSTAIN_KNOB 0x54
#define RELEASE_KNOB 0x07
#endif

#define RECORD_BUTTON 0x19
#define BACK_BUTTON 0x15
#define FORWARD_BUTTON 0x16
#define XOR_KNOB 0x5D
#define WAVE_OFFSET_KNOB 0x0A

ssd1306 display;
bool isEditing = false;

MidiSynth synth;

void noteOn(uint8_t channel, uint8_t note, uint8_t velocity) {
	synth.midiNoteOn(channel, note, velocity);
}

void noteOff(uint8_t channel, uint8_t note) {
	synth.midiNoteOff(channel, note);
}

void sysex(uint8_t cbData, uint8_t data[]) {
#if false
    if (data[0] != 0x7D) {
        return;
    }
    
    int8_t inAvailable = 7;
    int8_t outAvailable = 8;
    uint8_t out = 0;
    uint8_t len = 0;
    
    for (uint8_t i = 1; i < cbData;) {
        uint8_t byte = data[i];

        int8_t shift = outAvailable - inAvailable;
        if (shift > 0) {
            out |= (byte << shift) & 0xFF;
            outAvailable -= inAvailable;
            inAvailable -= inAvailable;
        } else {
            out |= byte >> -shift;
            inAvailable -= outAvailable;
            outAvailable -= outAvailable;
        }

        if (inAvailable == 0) {
            i++;
            inAvailable = 7;
        }

        if (outAvailable == 0) {
            data[len++] = out;
            out = 0;
            outAvailable = 8;
        }
    }

    uint8_t cursor = 0;
    uint8_t sysexCmd = data[cursor++];
    
    if (sysexCmd < 16) {
        synth.setWaveform(sysexCmd * 16, &data[cursor], 16);
    } else {
        switch (sysexCmd) {
            case 0x10: {
                const uint8_t channel = data[cursor++];
                Instrument& instrument = channels[channel];
                instrument.wave = Instruments::getWavetableAddress(static_cast<uint16_t>(data[cursor]) << 8 | data[cursor + 1]);
                cursor += 2;
                for (uint8_t i = 0; i < 4; i++) {
                    instrument.adsr.stages[i].divider = data[cursor++];
                    instrument.adsr.stages[i].slope = data[cursor++];
                    instrument.adsr.stages[i].limit = data[cursor++];
                }
				instrument.adsr.idleDivider = 0xFF;
                instrument.xorBits = data[cursor++];
                instrument.flags = static_cast<InstrumentFlags>(data[cursor++]);
            }
        }
    }
#endif
}

#if false
void setWaveform(int8_t delta) {
    channels[0].wave += delta * 64;
}
#endif

void controlChange(uint8_t channel, uint8_t control, uint8_t value) {
	synth.midiControlChange(channel, control, value);
}

void programChange(uint8_t channel, uint8_t value) {
    synth.midiProgramChange(channel, value);
}

void pitchBend(uint8_t channel, int16_t value) {
	synth.midiPitchBend(channel, value);
}

#include <avr/io.h>

void setup() {   
    midi_setup();

    display.begin();
    display.reset();
    display.setRegion(0, 127, 0, 7, 0);
    
    synth.begin();
    
    sei();
}

void loop() {
    static uint8_t displayChannel = 0;

    displayChannel++;
    displayChannel &= 0x0F;

    uint8_t y = synth.getAmp(displayChannel);
	if (y < 96) {
		y += y >> 1;
	} else {
		y = 128;
	}
	
    const uint8_t x = displayChannel << 3;
    const int8_t page = 7 - (y >> 3);
    midi_process();
    
    synth.suspend();                                // Suspend audio processing ISR so display can use SPI.
    display.select(x, x + 6, 0, 7);             
    synth.resume();
    
    // Set [0 .. page - 1]
    for (int8_t i = page; i > 0; i--) {
        synth.suspend();                            // Suspend audio processing ISR so display can use SPI.
        display.send7(0x00);
        synth.resume();
        midi_process();
    }

    {
        uint8_t remainder = 7 - (y & 0x07);
        synth.suspend();                            // Suspend audio processing ISR so display can use SPI.
        display.send7(~((1 << remainder) - 1));
        synth.resume();
        midi_process();
    }

    // Clear [page + 1 .. 7]
    for (int8_t i = 6 - page; i >= 0; i--) {
        synth.suspend();                            // Suspend audio processing ISR so display can use SPI.
        display.send7(0xFF);
        synth.resume();
        midi_process();
    }
}

#ifndef __EMSCRIPTEN__
int main() {
    setup();
    
    while(true) {
        loop();
    }
    
    return 0;
}
#endif // !__EMSCRIPTEN__