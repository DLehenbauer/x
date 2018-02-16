#ifndef __MIDI_H__
#define __MIDI_H__

#include "ringbuffer.h"

void midi_setup();
void midi_process();

#ifdef __EMSCRIPTEN__
void midi_decode_byte(uint8_t nextByte);
#endif // __EMSCRIPTEN__

#endif // __MIDI_H__