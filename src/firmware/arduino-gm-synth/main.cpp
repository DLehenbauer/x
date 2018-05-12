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

#define DAC Pwm01
#include "main.h"

#ifndef ARDUINO
#ifndef __EMSCRIPTEN__

// See 'main.h' for definitions of 'setup()' and 'loop()'.

int main() {
  setup();
  
  while(true) {
    loop();
  }
  
  return 0;
}
#endif // !__EMSCRIPTEN__
#endif // !ARDUINO