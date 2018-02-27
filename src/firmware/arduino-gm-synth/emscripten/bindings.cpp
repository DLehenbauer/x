#include "../lerp.h"#include "../synth.h"#include "../midi.h"#include "../midisynth.h"#include "../instruments.h"#include <emscripten/bind.h>
using namespace emscripten;
static uint32_t getWavetableAddress(uint16_t offset) {
	return reinterpret_cast<uint32_t>(Instruments::getWavetableAddress(offset));
}

extern uint8_t OCR2A;

static double getSampleRate() {
	return static_cast<double>(F_CPU) / 8L / static_cast<double>(Synth::sampleDivider);
}

EMSCRIPTEN_BINDINGS(firmware) {	function("midi_decode_byte", &midi_decode_byte);	function("getWavetableAddress", &getWavetableAddress);
	function("getWavetableByteLength", &Instruments::getWavetableByteLength);
	function("getLerpStagesAddress", &Instruments::getLerpStagesAddress, allow_raw_pointer<ret_val>());
	function("getLerpStagesByteLength", &Instruments::getLerpStagesByteLength);
	function("getSampleRate", &getSampleRate);
	class_<LerpStage>("LerpStage");	class_<Lerp>("Lerp")		.constructor<>()		.function("sample", &Lerp::sampleEm)		.function("start", &Lerp::startEm)		.function("stop", &Lerp::stopEm);	class_<Synth>("Synth")		.constructor<>()
		.function("sample", &Synth::sample)
		.function("noteOn", &Synth::noteOnEm)
		.function("noteOff", &Synth::noteOff);
	class_<MidiSynth, base<Synth>>("MidiSynth")		.constructor<>()		.function("midiNoteOn", &MidiSynth::midiNoteOn)		.function("midiNoteOff", &MidiSynth::midiNoteOff)		.function("midiPitchBend", &MidiSynth::midiPitchBend);
}