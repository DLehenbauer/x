#include <avr/pgmspace.h>
#include "instruments.h"
#include "instruments_generated.h"

template <typename T> void PROGMEM_readAnything(const T* src, T& dest) {
    memcpy_P(&dest, src, sizeof(T));
}

void Instruments::getInstrument(uint8_t index, Instrument& instrument) {
    PROGMEM_readAnything(&instruments[index], instrument);
}

uint8_t Instruments::getPercussionNote(uint8_t index) {
    return pgm_read_byte(&percussionNotes[index]);
}

void Instruments::getLerpProgram(uint8_t programIndex, LerpProgram& program) {
	PROGMEM_readAnything(&LerpPrograms[programIndex], program);
}

void Instruments::getLerpStage(uint8_t start, uint8_t stageIndex, LerpStage& stage) {
	PROGMEM_readAnything(&LerpStages[start + stageIndex], stage);
}

#ifdef __EMSCRIPTEN__

const HeapRegion<uint8_t> Instruments::getPercussionNotes() {
	return HeapRegion<uint8_t>(&percussionNotes[0], sizeof(percussionNotes));
}

const HeapRegion<int8_t> Instruments::getWavetable() {
    return HeapRegion<int8_t>(&Waveforms[0], sizeof(Waveforms));
}

const HeapRegion<LerpProgram> Instruments::getLerpPrograms() {
	return HeapRegion<LerpProgram>(&LerpPrograms[0], sizeof(LerpPrograms));
}

const HeapRegion<LerpStage> Instruments::getLerpStages() {
	return HeapRegion<LerpStage>(&LerpStages[0], sizeof(LerpStages));
}

const HeapRegion<Instrument> Instruments::getInstruments() {
	return HeapRegion<Instrument>(&instruments[0], sizeof(instruments));
}

#endif // __EMSCRIPTEN__