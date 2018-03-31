#include "lerp.h"
#include "instruments.h"

void Lerp::start(uint8_t programIndex) volatile {
	LerpProgram program;
	Instruments::getLerpProgram(programIndex, program);
	
	pStart = program.start;
	loopStart = program.loopStartAndEnd >> 4;
	loopEnd = program.loopStartAndEnd & 0x0F;
	amp = program.initialValue << 8;
	stageIndex = 0;
	
	loadStage();
}

void Lerp::loadStage() volatile {
	 LerpStage stage;
	 Instruments::getLerpStage(pStart, stageIndex, stage);
	 slope = stage.slope;
	 limit = stage.limit;
}