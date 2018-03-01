#ifndef __INSTRUMENT_H__
#define __INSTRUMENT_H__

#include "lerp.h"

#ifdef __EMSCRIPTEN__

#include <stddef.h>

template<typename T> 
struct HeapRegion {
	size_t start;
	size_t end;

	HeapRegion() {}
	
	HeapRegion(const T* pStart, const size_t length) {
		start = reinterpret_cast<size_t>(pStart);
		end = start + length;
	}
};
#endif

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
		static void getLerpProgram(uint8_t programIndex, LerpProgram& program);
		static void getLerpStage(uint8_t progStart, uint8_t stageIndex, LerpStage& stage);

#ifdef __EMSCRIPTEN__
        static const HeapRegion<int8_t> getWavetable();
		static const HeapRegion<LerpProgram> getLerpPrograms();
		static const HeapRegion<uint8_t> getLerpProgressions();
		static const HeapRegion<LerpStage> getLerpStages();
#endif // __EMSCRIPTEN__
};

#endif // __INSTRUMENT_H__
