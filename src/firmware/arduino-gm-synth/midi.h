#ifndef __MIDI_H__
#define __MIDI_H__

#include "ringbuffer.h"

#include <avr/interrupt.h>
#include <avr/io.h>
#include "midi.h"

constexpr uint8_t maxMidiData = 32;
RingBuffer<uint8_t, /* Log2Capacity: */ 6> _midiBuffer;

extern void noteOn(uint8_t channel, uint8_t note, uint8_t velocity);
extern void noteOff(uint8_t channel, uint8_t note);
extern void controlChange(uint8_t channel, uint8_t data1, uint8_t data2);
extern void pitchBend(uint8_t channel, int16_t value);
extern void programChange(uint8_t channel, uint8_t program);
extern void sysex(uint8_t cbData, uint8_t bytes[]);

ISR(USART_RX_vect) {
    _midiBuffer.enqueue(UDR0);
}

void midi_setup() {
    constexpr uint16_t baud = 31250;
    constexpr uint16_t ubrr = F_CPU / 16 / baud - 1;

    UBRR0H = static_cast<uint8_t>(ubrr >> 8);                   // 31250 baud
    UBRR0L = static_cast<uint8_t>(ubrr);

    UCSR0C= (0 << UMSEL00) | (0 << UMSEL01) |                   // async
            (0 << UPM00)   | (0 << UPM01)   |                   // parity none
            (0 << USBS0)   |                                    // 1 stop bits 1
            (0 << UCSZ02)  | (1 << UCSZ01)  | (1 << UCSZ00);    // 8 data bits

    UCSR0B |= _BV(RXEN0) | _BV(RXCIE0);                         // Enable receive w/interrupt
}

enum MidiStatus {
    /* 0x8n */ MidiStatus_NoteOff				= 0,     // 2 data bytes
    /* 0x9n */ MidiStatus_NoteOn				= 1,     // 2 data bytes
    /* 0xAn */ MidiStatus_PolyKeyPressure		= 2,     // 2 data bytes
    /* 0xBn */ MidiStatus_ControlChange			= 3,     // 2 data bytes
    /* 0xCn */ MidiStatus_ProgramChange			= 4,     // 1 data bytes
    /* 0xDn */ MidiStatus_ChannelPressure		= 5,     // 1 data bytes
    /* 0xEn */ MidiStatus_PitchBend				= 6,     // 2 data bytes
    /* 0xFn */ MidiStatus_Extended				= 7,     // (variable length)
    /* ???  */ MidiStatus_Unknown				= 8      // (unknown)
};

int8_t midiStatusToDataLength[] = {
    /* 0x8n: MidiCommand_NoteOff               */ 2,
    /* 0x9n: MidiCommand_NoteOn                */ 2,
    /* 0xAn: MidiCommand_PolyKeyPressure       */ 2,
    /* 0xBn: MidiCommand_ControlChange         */ 2,
    /* 0xCn: MidiCommand_ProgramChange         */ 1,
    /* 0xDn: MidiCommand_ChannelPressure       */ 1,
    /* 0xEn: MidiCommand_PitchBend             */ 2,
    /* 0xFn: MidiCommand_Extended              */ maxMidiData
};

MidiStatus midiStatus = MidiStatus_Unknown;     // Status of the incoming message
uint8_t midiChannel = 0xFF;                     // Channel of the incoming message
uint8_t midiDataRemaining = 0;                  // Expected number of data bytes remaining 
uint8_t midiDataIndex = 0;                      // Location at which next data byte will be written
uint8_t midiData[maxMidiData] = { 0 };          // Buffer containing incoming data bytes

void dispatchCommand() {
	const uint8_t midiData0 = midiData[0];
	
    switch (midiStatus) {
        case MidiStatus_NoteOff: {
            noteOff(midiChannel, midiData0);
            break;
        }
        case MidiStatus_NoteOn: {
            if (midiData[1] == 0) {
                noteOff(midiChannel, midiData0);
            } else {
                noteOn(midiChannel, midiData0, midiData[1]);
            }
            break;
        }
        case MidiStatus_PitchBend: {
            int16_t value = midiData[1];
            value <<= 7;
            value |= midiData0;
            value -= 0x2000;
            pitchBend(midiChannel, value);
            break;
        }
        case MidiStatus_ControlChange: {
            controlChange(midiChannel, midiData0, midiData[1]);
            break;
        }
        case MidiStatus_ProgramChange: {
            programChange(midiChannel, midiData0);
            break;
        }

        default: { break; }
    }
	
/* TODO: Handle running status?	
	midiDataRemaining = midiStatusToDataLength[midiStatus];				// Running Status: reset the midi data buffer for the current midi status
	midiDataIndex = 0;
*/
}

void midi_decode_byte(uint8_t nextByte) {
    if (nextByte & 0x80) {													// If the high bit is set, this is the start of a new message
        if (midiStatus == MidiStatus_Extended) {							//   If the previous status was an extended message (sysex or real-time)
            sysex(midiDataIndex, midiData);									//     the next byte must be 0xF7 (i.e., EOX).  Ignore EOX and dispatch the sysex().
			midiStatus = MidiStatus_Unknown;								//     The following byte must be a status byte beginning the next message.
            return;
        }
        
        midiStatus = static_cast<MidiStatus>((nextByte >> 4) - 8);
        midiDataRemaining = midiStatusToDataLength[midiStatus];				// Set the expected data bytes for the new message status.
        midiDataIndex = 0;													// Reset the midi data buffer.
        midiChannel = nextByte & 0x0F;
    } else {
        if (midiDataRemaining > 0) {					// If more data bytes are expected for the current midi status
            midiData[midiDataIndex++] = nextByte;		//	 then copy the next byte into the data buffer
            midiDataRemaining--;						//	   and decrement the remaining data bytes expected.
			if (midiDataRemaining == 0) {				//   If this was the last data byte expected
				dispatchCommand();						//     then dispatch the current command.
	        }
		}
    }
}

void midi_process() {
    uint8_t received;
    while (_midiBuffer.dequeue(received)) {
        midi_decode_byte(received);
    }
}

#endif // __MIDI_H__