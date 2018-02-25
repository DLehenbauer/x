#ifndef __INSTRUMENT_H__
#define __INSTRUMENT_H__

#include "lerp.h"

enum InstrumentFlags : uint8_t {
    InstrumentFlags_None = 0,
    InstrumentFlags_Noise         = (1 << 0),
    InstrumentFlags_HalfAmplitude = (1 << 1),
};

struct Instrument {
    const int8_t* wave;
    uint8_t ampMod;
	uint8_t freqMod;
    uint8_t xorBits;
    InstrumentFlags flags;
};

struct PercussiveInstrument {
  uint8_t note;
};

class Instruments {
    public:
        static void getInstrument(uint8_t index, Instrument& instrument);
        static void getDrum(uint8_t index, PercussiveInstrument& drum);
        static const int8_t* getWavetableAddress(uint16_t offset);
        static uint16_t getWavetableByteLength();
		static void getLerpProgram(uint8_t programIndex, LerpProgram& program);
		static void getLerpStage(uint8_t progStart, uint8_t stageIndex, LerpStage& stage);
};

#endif // __INSTRUMENT_H__
