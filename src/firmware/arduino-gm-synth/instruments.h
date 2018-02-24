#ifndef __INSTRUMENT_H__
#define __INSTRUMENT_H__

#include "adsr.h"

enum InstrumentFlags : uint8_t {
    InstrumentFlags_None = 0,
    InstrumentFlags_Noise         = (1 << 0),
    InstrumentFlags_HalfAmplitude = (1 << 1),
    InstrumentFlags_Damped        = (1 << 2),
};

struct Instrument {
    const int8_t* wave;
    ADSRParameters adsr;
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
};

#endif // __INSTRUMENT_H__
