#include "../lerp.h"#include "../synth.h"#include "../midi.h"#include "../midisynth.h"#include "../instruments.h"#include <emscripten/bind.h>
using namespace emscripten;
extern uint8_t OCR2A;

static double getSampleRate() {
	return static_cast<double>(F_CPU) / 8L / static_cast<double>(Synth::sampleDivider);
}

EMSCRIPTEN_BINDINGS(firmware) {	function("midi_decode_byte", &midi_decode_byte);	function("getWavetable", &Instruments::getWavetable);
	function("getLerpStages", &Instruments::getLerpStages);
	function("getLerpPrograms", &Instruments::getLerpPrograms);
	function("getLerpProgressions", &Instruments::getLerpProgressions);
	
	value_object<HeapRegion<int8_t>>("I8s")
		.field("start", &HeapRegion<int8_t>::start)
		.field("end", &HeapRegion<int8_t>::end);

	value_object<HeapRegion<uint8_t>>("U8s")
		.field("start", &HeapRegion<uint8_t>::start)
		.field("end", &HeapRegion<uint8_t>::end);

	value_object<HeapRegion<LerpStage>>("LerpStages")
		.field("start", &HeapRegion<LerpStage>::start)
		.field("end", &HeapRegion<LerpStage>::end);

	value_object<HeapRegion<LerpProgram>>("LerpPrograms")
		.field("start", &HeapRegion<LerpProgram>::start)
		.field("end", &HeapRegion<LerpProgram>::end);

	
	//function("getWavetableByteLength", &Instruments::getWavetableByteLength);
	//function("getLerpStagesAddress", &Instruments::getLerpStagesAddress, allow_raw_pointer<ret_val>());
	//function("getLerpStagesByteLength", &Instruments::getLerpStagesByteLength);
	function("getSampleRate", &getSampleRate);
	class_<LerpStage>("LerpStage");	class_<LerpProgram>("LerpProgram");	class_<Lerp>("Lerp")		.constructor<>()		.function("sample", &Lerp::sampleEm)		.function("start", &Lerp::startEm)		.function("stop", &Lerp::stopEm);	class_<Synth>("Synth")		.constructor<>()
		.function("sample", &Synth::sample)
		.function("noteOn", &Synth::noteOnEm)
		.function("noteOff", &Synth::noteOff);
	class_<MidiSynth, base<Synth>>("MidiSynth")		.constructor<>()		.function("midiNoteOn", &MidiSynth::midiNoteOn)		.function("midiNoteOff", &MidiSynth::midiNoteOff)		.function("midiPitchBend", &MidiSynth::midiPitchBend);
}