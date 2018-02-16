#include "../synth.h"#include "../midi.h"#include "../midisynth.h"#include <emscripten/bind.h>
using namespace emscripten;
EMSCRIPTEN_BINDINGS(firmware) {	function("midi_decode_byte", &midi_decode_byte);	class_<Synth>("Synth")		.constructor<>()
		.function("sample", &Synth::sample)
		.function("noteOn", &Synth::noteOnEm)
		.function("noteOff", &Synth::noteOff);
	class_<MidiSynth, base<Synth>>("MidiSynth")		.constructor<>()		.function("midiNoteOn", &MidiSynth::midiNoteOn)		.function("midiNoteOff", &MidiSynth::midiNoteOff)		.function("midiPitchBend", &MidiSynth::midiPitchBend);		
}