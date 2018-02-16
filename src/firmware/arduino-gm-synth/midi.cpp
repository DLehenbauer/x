#include <avr/interrupt.h>
#include <avr/io.h>
#include "midi.h"

extern void noteOn(uint8_t channel, uint8_t note, uint8_t velocity);
extern void noteOff(uint8_t channel, uint8_t note);
extern void controlChange(uint8_t channel, uint8_t data1, uint8_t data2);
extern void pitchBend(uint8_t channel, int16_t value);
extern void programChange(uint8_t channel, uint8_t program);
extern void sysex(uint8_t cbData, uint8_t bytes[]);

RingBuffer<uint8_t> _midiBuffer;

ISR(USART_RX_vect) {
    _midiBuffer.enqueue(UDR0);
}

void midi_setup() {
    constexpr uint16_t baud = 31250;    constexpr uint16_t ubrr = F_CPU / 16 / baud - 1;
    UBRR0H = static_cast<uint8_t>(ubrr >> 8);                   // 31250 baud    UBRR0L = static_cast<uint8_t>(ubrr);
    UCSR0C= (0 << UMSEL00) | (0 << UMSEL01) |                   // async            (0 << UPM00)   | (0 << UPM01)   |                   // parity none            (0 << USBS0)   |                                    // 1 stop bits 1            (0 << UCSZ02)  | (1 << UCSZ01)  | (1 << UCSZ00);    // 8 data bits    UCSR0B |= _BV(RXEN0) | _BV(RXCIE0);                         // Enable receive w/interrupt}

enum MidiCommand {
    /* 0x8n */ MidiCommand_NoteOff              = 0,     // 2 data bytes
    /* 0x9n */ MidiCommand_NoteOn               = 1,     // 2 data bytes
    /* 0xAn */ MidiCommand_PolyPressureChange   = 2,     // 2 data bytes
    /* 0xBn */ MidiCommand_ControlChange        = 3,     // 2 data bytes
    /* 0xCn */ MidiCommand_ProgramChange        = 4,     // 1 data bytes
    /* 0xDn */ MidiCommand_MonoPressureChange   = 5,     // 1 data bytes
    /* 0xEn */ MidiCommand_PitchBend            = 6,     // 2 data bytes
    /* 0xFn */ MidiCommand_Extended             = 7,     // (unknown)
    /* ???  */ MidiCommand_Unknown              = 8      // (unknown)
};

int8_t midiCommandToDataLength[] = {
    /* 0x8n: MidiCommand_NoteOff               */ 2,
    /* 0x9n: MidiCommand_NoteOn                */ 2,
    /* 0xAn: MidiCommand_PolyPressureChange    */ 2,
    /* 0xBn: MidiCommand_ControlChange         */ 2,
    /* 0xCn: MidiCommand_ProgramChange         */ 1,
    /* 0xDn: MidiCommand_MonoPressureChange    */ 1,
    /* 0xEn: MidiCommand_PitchBend             */ 2,
    /* 0xFn: MidiCommand_Extended              */ 32
};

MidiCommand midiCmd     = MidiCommand_Unknown;
uint8_t midiChannel = 0xFF;
int8_t midiDataRemaining = -1;
uint8_t midiDataIndex = 0;
uint8_t midiData[32] = { 0 };

void dispatchCommand() {
    switch (midiCmd) {
        case MidiCommand_NoteOff: {
            noteOff(midiChannel, midiData[0]);
            break;
        }
        case MidiCommand_NoteOn: {
            if (midiData[1] == 0) {
                noteOff(midiChannel, midiData[0]);
            } else {
                noteOn(midiChannel, midiData[0], midiData[1]);
            }
            break;
        }
        case MidiCommand_PitchBend: {
            int16_t value = midiData[1];
            value <<= 7;
            value |= midiData[0];
            value -= 0x2000;
            pitchBend(midiChannel, value);
            break;
        }
        case MidiCommand_ControlChange: {
            controlChange(midiChannel, midiData[0], midiData[1]);
            break;
        }
        case MidiCommand_ProgramChange: {
            programChange(midiChannel, midiData[0]);
            break;
        }

        default: { break; }
    }
}

void midi_decode_byte(uint8_t nextByte) {
    if (nextByte & 0x80) {
        if (midiCmd == MidiCommand_Extended) {
            sysex(midiDataIndex, midiData);
            if (nextByte == 0xF7) {
                return;
            }
        }
        
        MidiCommand cmd = static_cast<MidiCommand>((nextByte >> 4) - 8);
        midiDataIndex = 0;
        midiDataRemaining = midiCommandToDataLength[cmd];
        midiCmd = cmd;
        midiChannel = nextByte & 0x0F;
        return;
    } else {
        if (midiDataRemaining > 0) {
            midiData[midiDataIndex++] = nextByte;
            midiDataRemaining--;
        }
        if (midiDataRemaining == 0) {
            dispatchCommand();
            midiDataRemaining--;
        }
    }
}

void midi_process() {
    uint8_t received;
    while (_midiBuffer.dequeue(received)) {
        midi_decode_byte(received);
    }
}