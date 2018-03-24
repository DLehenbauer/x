#include "lerp.h"
#include "instruments.h"

void Lerp::start(uint8_t programIndex, uint8_t init) volatile {
	amp = init << 8;
	stageIndex = 0;

	LerpProgram program;
	Instruments::getLerpProgram(programIndex, program);
	
	pStart = program.start;
	loopStart = program.loopStartAndEnd >> 4;
	loopEnd = program.loopStartAndEnd & 0x0F;
	
	loadStage();
}

void Lerp::loadStage() volatile {
	 LerpStage stage;
	 Instruments::getLerpStage(pStart, stageIndex, stage);
	 slope = stage.slope;
	 limit = stage.limit;
}