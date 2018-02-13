#include <stdint.h>
#include "midi.h"
#include "synth.h"
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

uint8_t voiceToNote[Synth::numVoices];
uint8_t voiceToChannel[Synth::numVoices];

Synth synth;        //-Make a synth
Instrument channels[16];

void noteOn(uint8_t channel, uint8_t note, uint8_t velocity) {
    if (channel == 9) {
        uint8_t index = note - 35;
        if (index >= 46) { index = 45; }
        
        PercussiveInstrument drum;
        Instruments::getDrum(index, drum);

        Instruments::getInstrument(0x80 + index, channels[9]);
        note = drum.note;
    }
    
    uint8_t voice = synth.getNextVoice();
    const Instrument& ch = channels[channel];
    
    synth.noteOn(voice, note, velocity, ch);

    voiceToNote[voice] = note;
    voiceToChannel[voice] = channel;
}

void noteOff(uint8_t channel, uint8_t note) {
    for (int8_t voice = Synth::maxVoice; voice >= 0; voice--) {
        if (voiceToNote[voice] == note && voiceToChannel[voice] == channel) {
            synth.noteOff(voice);
            voiceToChannel[voice] = 0xFF;
            voiceToNote[voice] = 0xFF;
        }
    }
}

void sysex(uint8_t cbData, uint8_t data[]) {
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
}

void setWaveform(int8_t delta) {
    channels[0].wave += delta * 64;
}

void controlChange(uint8_t channel, uint8_t knob, uint8_t value) {
    if (!isEditing && knob != RECORD_BUTTON) {
        return;
    }
    
    switch(knob) {
        case RECORD_BUTTON:
        if (value == 0x7F) {
            isEditing = !isEditing;
        }
        break;
        case BACK_BUTTON: {
            if (value == 0x7F) {
                setWaveform(-1);
            }
            break;
        }
        case FORWARD_BUTTON: {
            if (value == 0x7F) {
                setWaveform(1);
            }
            break;
        }
        case ATTACK_KNOB: {
            channels[0].adsr.setLimit(ADSRStage_Attack, 0x7F);
            channels[0].adsr.setDuration(ADSRStage_Attack, value);
            break;
        }
        case DECAY_KNOB: {
            channels[0].adsr.setLimit(ADSRStage_Attack, 0x7F);
            channels[0].adsr.setDuration(ADSRStage_Decay, value);
            break;
        }
        case SUSTAIN_KNOB: {
            channels[0].adsr.setLimit(ADSRStage_Decay, value);
            channels[0].adsr.setLimit(ADSRStage_Sustain, value);
            channels[0].adsr.stages[ADSRStage_Sustain].divider = 0x00;
            channels[0].adsr.setDuration(ADSRStage_Sustain, 0);
            break;
        }
        case RELEASE_KNOB: {
            channels[0].adsr.setLimit(ADSRStage_Release, 0);
            channels[0].adsr.setDuration(ADSRStage_Release, value);
            break;
        }
        case XOR_KNOB: {
            channels[0].xorBits = value;
            break;
        }
        /*
        case WAVE_OFFSET_KNOB: {
            channels[0].waveOffset = value << 1;
        }
        */
    }
}

void programChange(uint8_t channel, uint8_t program) {
    Instruments::getInstrument(program, channels[channel]);
}

void pitchBend(uint8_t midiChannel, int16_t value) {
    for (int8_t voice = Synth::maxVoice; voice >= 0; voice--) {
        if (voiceToChannel[voice] == midiChannel) {
            synth.pitchBend(voice, value);
        }
    }
}

#include <avr/io.h>

void setup() {   
    midi_setup();

    for (int i = 0; i < 16; i++) {
        Instruments::getInstrument(0, channels[i]);
    }

    for (int i = 0; i < Synth::numVoices; i++) {
        voiceToNote[i] = 0xFF;
        voiceToChannel[i] = 0xFF;
    }
    
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

    const uint8_t y = synth.getAmp(displayChannel);
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

int main() {
    setup();
    
    while(true) {
        loop();
    }
    
    return 0;
}