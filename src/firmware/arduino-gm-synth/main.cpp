/*
    Arduino Midi Synth v0.1
    
    This sketch turns an Arduino Uno into a 16-voice wavetable synthesizer functioning as a
    MIDI sound module.  It may be used for generating sound for a MIDI keyboard controller
    or playback of MIDI files.
    
    The MIDI synth implements the most commonly used features of the General MIDI 1.0 standard
    including 128 standard instruments, 45 percussion instruments, key velocity, and pitch bend
    with the following caveats:
    
      - Some of the less frequently used instruments are currently placeholders.
      - Pitch bend status does not currently persist (i.e., resets on next note down)
      - MIDI running status is not implemented.
      
    (All relatively straight forward to address, they just haven't yet affected my enjoyment of
    the project. :)
    
    The synth engine features:
      - 16 voices sampled & mixed in real-time at ~20kHz
      - Wavetable and white noise sources
      - Amplitude, frequency, and wavetable offset modulated by envelope generators
      - Additional volume control per voice (matching MIDI velocity)

    The resulting sound quality is surprisingly respectable for an 8-bit microcontroller and a
    couple of resistors.
    
    The circuit:
    
                        1M*                    10uf**
            pin 5 >----^v^v^----o--------o------|(----> audio out
                                |        |
                       3.9k*    |       === 3.3uf***
            pin 6 >----^v^v^----o        |
                                        gnd
                                        
        * Use 1% resistors, ideally ordering extras and selecting the pair of 1M and 3.9k that
          most closely matches a 1:256 ratio (or adding a trim pot to get the precise ratio):
          http://www.openmusiclabs.com/learning/digital/pwm-dac/dual-pwm-circuits/index.html
          
       ** A/C coupling capacitor can typically be omitted (most audio inputs remove DC bias).
       
      *** Low pass RC filter capacitor can be adjusted to taste:
     
                               8kHz      10kHz      30kHz
                    2.2nf ~=  -0.7db    -1.1db     -5.6db
                    3.3nf ~=  -1.5db    -2.2db     -8.4db
                    4.7nf ~=  -2.7db    -3.6db    -11.1db

    Sending MIDI data to the Arduino:
    
    The easiest/fastest way to send MIDI data from your computer is to use a MIDI <-> Serial Bridge:
    http://projectgus.github.io/hairless-midiserial/
    
    If you have an ISP programmer and an Uno R3 w/ATMega82U, you can make your Arduino Uno appear
    as a native USB MIDI device:
    https://github.com/kuwatay/mocolufa
    
    Finally, with a bit more circuitry, you can add an 5-pin DIN serial MIDI input port to the
    Arduino and use a standard serial MIDI interface.
    
                220 
        .------^v^v^----------o-------.                      .----o--------------o----< +5v
        |                     |       |                      |    |              |
        |     .-----.         |  1    |      .--------.      |   === 100nF       /
        |    / 5-DIN \       _|_ N    o----1-|        |-6----'    |              \ 
        |   |  (back) |       ^  9    o----2-| H11L1* |-5---------o--< Gnd       / 280
        |   |o       o|      /_\ 1    |      |        |-4----.                   \
        |    \ o o o /        |  4    |      '--------'      |                   /
        |     /-----\         |       |                      |                   |
        |  4 /       \ 5      |       |                      '-------------------o----> RX
        '---'         '-------o-------'
        
    Notes:
        * H11L1 is a PC900 equivalent
*/

/*
    Baseline (w/Pwm0):
    Program Memory Usage 	:	32096 bytes
    Data Memory Usage 		:	1019 bytes

    Ltc16xx:  +22B
    Pwm01:    +68B
*/

#define DAC Pwm0
//#define DAC Ltc16xx<PinId::D10>
//#define DAC Pwm01

#include <stdint.h>
#include "drivers/midi.h"
#include "drivers/ssd1306.h"
#include "midisynth.h"

Ssd1306 display;    // SSD1306 driver for 128x64 OLED SPI display
MidiSynth synth;

// The below thunks are invoked during Midi::Dispatch() and forwarded to our MidiSynth.
void noteOn(uint8_t channel, uint8_t note, uint8_t velocity)		    { synth.midiNoteOn(channel, note, velocity); }
void noteOff(uint8_t channel, uint8_t note)							            { synth.midiNoteOff(channel, note); }
void sysex(uint8_t cbData, uint8_t data[])							            { /* do nothing */ }
void controlChange(uint8_t channel, uint8_t control, uint8_t value) { synth.midiControlChange(channel, control, value); }
void programChange(uint8_t channel, uint8_t value)					        { synth.midiProgramChange(channel, value); }
void pitchBend(uint8_t channel, int16_t value)						          { synth.midiPitchBend(channel, value); }

// Invoked once after the device is reset, prior to starting the main 'loop()' below.
void setup() {
  display.begin();                        // Initializing the display prior to start the synth ensures that
  display.reset();                        // the display has exclusive access to SPI during 'setup()'.
  display.setRegion(0, 127, 0, 7, 0);     // (Note: 7 -> pages 0..7, each page being 8px, for 64px total.)
  
  synth.begin();                          // Start synth sample/mixing on Timer2 ISR

  Midi::begin(31250);                     // Start receiving MIDI messages via USART.
  
  sei();                                  // Begin processing interrupts.
}

// Helper used by main 'loop()' to set each column of an 8x7 block of pixels to the given mask,
// and then dispatch any MIDI messages that were queued while the SPI transfer was in progress.
//
// Note: Because this is the only call to 'display.send7()', AVR8/GNU C Compiler v5.4.0 will
//       inline it (even with -Os), and then jump into Midi::dispatch().
void display_send7(uint8_t mask) {
    synth.suspend();                            // Suspend audio processing ISR so display has exclusive access to SPI.
    display.send7(mask);                        // Set first 7 columns of currently selected 8x8 block to given 'mask'.
    synth.resume();                             // Resume audio processing.
    Midi::dispatch();                           // (Drain the pending queue of MIDI messages)
}

// There are four activities happening concurrently, roughly in priority order:
//
//    1. The USART RX ISR started by Midi::begin() is queuing incoming bytes from the serial port
//       in a circular buffer for later dispatch.
//
//    2. The Timer2 ISR started by synth.begin() is sampling/mixing and updating the output
//       waveform (by default, at ~20khz).
//
//    3. The main 'loop()' below interleaves the following two activities:
//        a. Handling the MIDI messages queued by the USART RX ISR by updating the state of the synth.
//        b. Updating the bar graph on the OLED display with the current amplitude of each voice.
//
void loop() {
  static uint8_t voice = 0;                   // Each time through the loop, we update the bar for one voice (in
  voice++;                                    // round-robin order.)
  voice &= 0x0F;

  uint8_t y = synth.getAmp(voice);            // The height of the bar is equal to 1.5x the current amplitude,
  y += y >> 1;                                // with a maximum of 64px (i.e., [0..63])
  y &= 0x3F;
  
  const uint8_t x = voice << 3;               // Calculate the left edge of the bar from the voice index.
  const int8_t page = 7 - (y >> 3);           // Calculate the 8px page that contains 'y'.
  Midi::dispatch();                           // (Drain the pending queue of MIDI messages)
  
  synth.suspend();                            // Suspend audio processing ISR so display has exclusive access to SPI.
  display.select(x, x + 6, 0, 7);             // Select the 7px x 64px area of the display containing the current bar.
  synth.resume();                             // Resume audio processing.
  
  for (int8_t i = page; i > 0; i--) {         // Clear 7x8 blocks above the new bar graph's current level.
    display_send7(0x00);
  }

  {                                           // Set/Clear the pixel of the 7x8 block containing the current bar graph level.
    const uint8_t remainder = 7 - (y & 0x07);
    display_send7(~((1 << remainder) - 1));
  }

  for (int8_t i = 6 - page; i >= 0; i--) {    // Set 7x8 blocks under the new bar graph's current level.
    display_send7(0xFF);
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