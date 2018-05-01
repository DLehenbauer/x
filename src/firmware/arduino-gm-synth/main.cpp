/*
    Baseline (w/Ltc16xx):
    Program Memory Usage 	:	32216 bytes
    Data Memory Usage 		:	1022 bytes

    Pwm0: (-12B)
*/

#define DAC Ltc16xx<PinId::D10>
//#define DAC Pwm0
//#define DAC Pwm1
//#define DAC Pwm01

#include <stdint.h>
#include "midi.h"
#include "midisynth.h"
#include "instruments.h"
#include "drivers/ssd1306.h"

ssd1306 display;
MidiSynth synth;

void noteOn(uint8_t channel, uint8_t note, uint8_t velocity)		    { synth.midiNoteOn(channel, note, velocity); }
void noteOff(uint8_t channel, uint8_t note)							            { synth.midiNoteOff(channel, note); }
void sysex(uint8_t cbData, uint8_t data[])							            { }
void controlChange(uint8_t channel, uint8_t control, uint8_t value) { synth.midiControlChange(channel, control, value); }
void programChange(uint8_t channel, uint8_t value)					        { synth.midiProgramChange(channel, value); }
void pitchBend(uint8_t channel, int16_t value)						          { synth.midiPitchBend(channel, value); }

void setup() {
  Midi::setup();

  display.begin();
  display.reset();
  display.setRegion(0, 127, 0, 7, 0);
  
  synth.begin();
  
  sei();
}

void loop() {
  static uint8_t voice = 0;
  voice++;
  voice &= 0x0F;

  uint8_t y = synth.getAmp(voice);
  y += y >> 1;
  y &= 0x3F;
  
  const uint8_t x = voice << 3;
  const int8_t page = 7 - (y >> 3);
  Midi::dispatch();
  
  synth.suspend();                              // Suspend audio processing ISR so display can use SPI.
  display.select(x, x + 6, 0, 7);
  synth.resume();
  
  // Set [0 .. page - 1]
  for (int8_t i = page; i > 0; i--) {
    synth.suspend();                            // Suspend audio processing ISR so display can use SPI.
    display.send7(0x00);
    synth.resume();
    Midi::dispatch();
  }

  {
    const uint8_t remainder = 7 - (y & 0x07);
    synth.suspend();                            // Suspend audio processing ISR so display can use SPI.
    display.send7(~((1 << remainder) - 1));
    synth.resume();
    Midi::dispatch();
  }

  // Clear [page + 1 .. 7]
  for (int8_t i = 6 - page; i >= 0; i--) {
    synth.suspend();                            // Suspend audio processing ISR so display can use SPI.
    display.send7(0xFF);
    synth.resume();
    Midi::dispatch();
  }
}

#ifndef ARDUINO
#ifndef __EMSCRIPTEN__
int main() {
  setup();
  
  while(true) {
    loop();
  }
  
  return 0;
}
#endif // !__EMSCRIPTEN__
#endif // !ARDUINO