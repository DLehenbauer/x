#ifndef __INSTRUMENT_H__
#define __INSTRUMENT_H__

struct LerpStage {
  int16_t slope;
  int8_t limit;
};

struct LerpProgram {
  const LerpStage* start;
  uint8_t initialValue;
  uint8_t loopStartAndEnd;
};

#ifdef __EMSCRIPTEN__

#include <stddef.h>

template<typename T>
struct HeapRegion {
  size_t start;
  size_t end;
  size_t itemSize;

  HeapRegion() {}
  
  HeapRegion(const T* pStart, const size_t length) {
    start = reinterpret_cast<size_t>(pStart);
    end = start + length;
    itemSize = sizeof(T);
  }
};
#endif

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

class Instruments {
  public:
    static void getInstrument(uint8_t index, Instrument& instrument);
    static uint8_t getPercussionNote(uint8_t index);
    static void getLerpProgram(uint8_t programIndex, LerpProgram& program);
    static void getLerpStage(const LerpStage* pStart, uint8_t stageIndex, LerpStage& stage);

  #ifdef __EMSCRIPTEN__
    static const HeapRegion<uint8_t> getPercussionNotes();
    static const HeapRegion<int8_t> getWavetable();
    static const HeapRegion<LerpProgram> getLerpPrograms();
    static const HeapRegion<LerpStage> getLerpStages();
    static const HeapRegion<Instrument> getInstruments();
  #endif // __EMSCRIPTEN__
};

#endif // __INSTRUMENT_H__
