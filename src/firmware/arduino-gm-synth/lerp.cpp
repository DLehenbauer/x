#include "lerp.h"
#include "instruments.h"

void Lerp::start(uint8_t programIndex, uint8_t init) volatile {
	amp = init;
	stageIndex = 0;

	LerpProgram program;
	Instruments::getLerpProgram(programIndex, program);
	
	progressionStart = program.progressionStart;
	loopStart = program.loopStartAndEnd >> 4;
	loopEnd = program.loopStartAndEnd & 0x0F;
	
	loadStage();
}

void Lerp::loadStage() volatile {
	 LerpStage stage;
	 Instruments::getLerpStage(progressionStart, stageIndex, stage);
	 slope = stage.slope;
	 limit = stage.limit;
}