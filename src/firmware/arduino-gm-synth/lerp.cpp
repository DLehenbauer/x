#include "lerp.h"
#include "instruments.h"

void Lerp::start(uint8_t programIndex) volatile {
	LerpProgram program;
	Instruments::getLerpProgram(programIndex, program);
	
	progressionStart = program.progressionStart;
	loopStart = program.loopStartAndEnd >> 4;
	loopEnd = program.loopStartAndEnd & 0x0F;

	divider = 0;
	amp = 0;
	stageIndex = 0;
	
	loadStage();
}


void Lerp::loadStage() volatile {
	 LerpStage stage;
	 Instruments::getLerpStage(progressionStart, stageIndex, stage);
	 dividerLimit = stage.divider;
	 slope = stage.slope;
	 limit = stage.limit;
}