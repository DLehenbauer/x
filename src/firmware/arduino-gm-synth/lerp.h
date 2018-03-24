#ifndef __LERP_H__
#define __LERP_H__

#include <stdint.h>

#define min(a,b) ((a)<(b)?(a):(b))
#define max(a,b) ((a)>(b)?(a):(b))

struct LerpStage {
	int16_t slope;
	int8_t limit;
};

struct LerpProgram {
	const LerpStage* start;
	uint8_t loopStartAndEnd;
};

const LerpStage defaultStage = { 0, -64 };

class Lerp {
	private:
		const LerpStage* pStart = &defaultStage;
		uint8_t loopStart = 0xFF;
		uint8_t loopEnd = 0xFF;
		uint8_t stageIndex = 0xFF;
		int16_t amp = 0;
		int16_t slope = 0;
		int8_t limit = -128;
	
		void loadStage() volatile;
	
	public:
		uint8_t sample() volatile {
			amp += slope;
			int8_t out = amp >> 8;

			const bool nextStage = (out < 0) ||
				(slope <= 0)
					? out < limit
					: out > limit;
		
			if (nextStage) {
				out = limit;
				amp = limit << 8;
				stageIndex++;
				if (stageIndex == loopEnd) {
					stageIndex = loopStart;
				}
				loadStage();
			}
		
			return out;
		}
		
		void start(uint8_t program, uint8_t init) volatile;

		void stop() volatile {
			if (stageIndex < loopEnd) {
				stageIndex = loopEnd;
				loadStage();
			}
		}

		friend class Synth;
		
		#ifdef __EMSCRIPTEN__

		uint8_t sampleEm() { return sample(); }
		void startEm(uint8_t program, uint8_t init) { start(program, init); }
		void stopEm() { stop(); }
		
		#endif // __EMSCRIPTEN__
};

#undef min
#undef max

#endif //__LERP_H__
