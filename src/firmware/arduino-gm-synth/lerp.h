#ifndef __LERP_H__
#define __LERP_H__

#include <stdint.h>

#define min(a,b) ((a)<(b)?(a):(b))
#define max(a,b) ((a)>(b)?(a):(b))

struct LerpStage {
	uint8_t divider;
	int8_t slope;
	int8_t limit;
};

struct LerpProgram {
	uint8_t progressionStart;
	uint8_t loopStartAndEnd;
};

class Lerp {
	private:
		uint8_t progressionStart = 0;
		uint8_t loopStart = 0xFF;
		uint8_t loopEnd = 0xFF;
		uint8_t stageIndex = 0xFF;
		uint8_t divider = 0;
		int8_t amp = 0;
		
		uint8_t dividerLimit = 0xFF;
		int8_t slope;
		int8_t limit;
	
		void loadStage() volatile;
	
	public:
		uint8_t sample() volatile {
			// Divider is a 7-bit counter looping from 0x00..0x7F.  This allows us to use a mask of 0x80+
			// as an infinite hold.
			divider = (divider + 1) & 0x7F;
		
			if (divider < dividerLimit) {
				return amp;
			}

			divider = 0;
			amp += slope;

			const bool nextStage = amp < 0 || (
				(slope < 0)
					? amp < limit
					: amp > limit);
		
			if (nextStage) {
				amp = limit;
				stageIndex = stageIndex == loopEnd
					 ? loopStart
					 : stageIndex + 1;
				loadStage();
			}
		
			return amp;
		}
	
		void start(uint8_t program) volatile;

		void stop(uint8_t stopIndex) volatile {
			
			if (stageIndex < loopEnd) {
				stageIndex = loopEnd;
				loadStage();
			}
		}

		friend class Synth;
};

#undef min
#undef max

#endif //__LERP_H__
