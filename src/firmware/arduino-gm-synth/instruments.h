#ifndef __INSTRUMENT_H__
#define __INSTRUMENT_H__

#include <avr/pgmspace.h>

struct LerpStage {
  int16_t slope;
  int8_t limit;
};

struct LerpProgram {
  const LerpStage* start;
  uint8_t initialValue;
  uint8_t loopStartAndEnd;
};

enum InstrumentFlags : uint8_t {
  InstrumentFlags_None				      = 0,
  InstrumentFlags_Noise				      = (1 << 0),
  InstrumentFlags_HalfAmplitude		  = (1 << 1),
  InstrumentFlags_SelectAmplitude		= (1 << 2),
  InstrumentFlags_SelectWave			  = (1 << 3),
};

struct Instrument {
  const int8_t* wave;
  uint8_t ampMod;
  uint8_t freqMod;
  uint8_t waveMod;
  uint8_t xorBits;
  InstrumentFlags flags;
};

template <typename T> void PROGMEM_copy(const T* src, T& dest) {
  memcpy_P(&dest, src, sizeof(T));
}

class Instruments {
  private:
    #include "instruments_generated.h"

  public:
    static void getInstrument(uint8_t index, Instrument& instrument) {
      PROGMEM_copy(&instruments[index], instrument);
    }

    static uint8_t getPercussiveInstrument(uint8_t note, Instrument& instrument) {
      /* TODO: Support additional GS/GM2 percussion
        http://www.voidaudio.net/percussion.html (loads very slowly)
    
        27 High Q
        28 Slap
        29 Scratch Push
        30 Scratch Pull
        31 Sticks
        32 Square Click
        33 Metronome Click
        34 Metronome Bell
        ...
        81 Shaker
        82 Jingle Bell
        83 Belltree
        84 Castanets
        85 Mute Surdo
        86 Open Surdo
        */
      uint8_t index = note - 35;							        // Calculate the the index of the percussion instrument relative      if (index > 45) { index = 45; }					        // to the beginning of the percussion instruments (i.e., less 128).
      Instruments::getInstrument(0x80 + index,			  // Load the percussion instrument        instrument);		                              // (Note: percussion instruments begin at 128)

      return pgm_read_byte(&percussionNotes[index]);  // Return the frequency (i.e., midi note) to play the instrument.
    }

    static void getLerpProgram(uint8_t programIndex, LerpProgram& program) {
      PROGMEM_copy(&LerpPrograms[programIndex], program);
    }

    static void getLerpStage(const LerpStage* pStart, uint8_t stageIndex, LerpStage& stage) {
      PROGMEM_copy(pStart + stageIndex, stage);
    }

  #ifdef __EMSCRIPTEN__
    static const HeapRegion<uint8_t> getPercussionNotes() {
      return HeapRegion<uint8_t>(&percussionNotes[0], sizeof(percussionNotes));
    }

    static const HeapRegion<int8_t> getWavetable() {
      return HeapRegion<int8_t>(&Waveforms[0], sizeof(Waveforms));
    }

    static const HeapRegion<LerpProgram> getLerpPrograms() {
      return HeapRegion<LerpProgram>(&LerpPrograms[0], sizeof(LerpPrograms));
    }

    static const HeapRegion<LerpStage> getLerpStages() {
      return HeapRegion<LerpStage>(&LerpStages[0], sizeof(LerpStages));
    }

    static const HeapRegion<Instrument> getInstruments() {
      return HeapRegion<Instrument>(&instruments[0], sizeof(instruments));
    }
  #endif // __EMSCRIPTEN__
};

constexpr LerpStage Instruments::LerpStages[] PROGMEM;
constexpr LerpProgram Instruments::LerpPrograms[] PROGMEM;
constexpr Instrument Instruments::instruments[] PROGMEM;
constexpr int8_t Instruments::Waveforms[] PROGMEM;
constexpr uint8_t Instruments::percussionNotes[] PROGMEM;

#endif // __INSTRUMENT_H__