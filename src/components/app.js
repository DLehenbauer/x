import { h, Component } from 'preact';
import { Router } from 'preact-router';

import Header from './header';
import Home from '../routes/home';
import Code from '../routes/code';
import Settings from '../routes/settings';
import Play from '../routes/play';
import Import from '../routes/import';
// import Home from 'async!../routes/home';
// import Profile from 'async!../routes/profile';

import Firmware from '../firmware/firmware-client';
import * as uc from 'unchanged';

if (module.hot) {
	require('preact/debug');
}

export default class App extends Component {
	state = {
		ready: false,
		lastMidiMessage: [],
		trackMidi: false,
		model: {
			currentChannel: 0,
			channelToInstrument: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			wavetable: [],
			instruments: [{
				name: "Acoustic Grand Piano",
				waveOffset: 0,
				ampMod: 0,
				freqMod: 0,
				xor: 0,
				instrumentFlags: 0
			}]
		},
		instrumentNames: [
			// Piano
			"Acoustic Grand Piano",
			"Bright Acoustic Piano",
			"Electric Grand Piano",
			"Honky-tonk Piano",
			"Electric Piano 1",
			"Electric Piano 2",
			"Harpsichord",
			"Clavinet",

			// Chromatic Percussion
			"Celesta",
			"Glockenspiel",
			"Music Box",
			"Vibraphone",
			"Marimba",
			"Xylophone",
			"Tubular Bells",
			"Dulcimer",

			// Organ
			"Drawbar Organ",
			"Percussive Organ",
			"Rock Organ",
			"Church Organ",
			"Reed Organ",
			"Accordion",
			"Harmonica",
			"Tango Accordion",

			// Guitar
			"Acoustic Guitar (nylon)",
			"Acoustic Guitar (steel)",
			"Electric Guitar (jazz)",
			"Electric Guitar (clean)",
			"Electric Guitar (muted)",
			"Overdriven Guitar",
			"Distortion Guitar",
			"Guitar Harmonics",

			// Bass
			"Acoustic Bass",
			"Electric Bass (finger)",
			"Electric Bass (pick)",
			"Fretless Bass",
			"Slap Bass 1",
			"Slap Bass 2",
			"Synth Bass 1",
			"Synth Bass 2",

			// Strings
			"Violin",
			"Viola",
			"Cello",
			"Contrabass",
			"Tremolo Strings",
			"Pizzicato Strings",
			"Orchestral Harp",
			"Timpani",

			// Ensemble
			"String Ensemble 1",
			"String Ensemble 2",
			"Synth Strings 1",
			"Synth Strings 2",
			"Choir Aahs",
			"Voice Oohs",
			"Synth Choir",
			"Orchestra Hit",

			// Brass
			"Trumpet",
			"Trombone",
			"Tuba",
			"Muted Trumpet",
			"French Horn",
			"Brass Section",
			"Synth Brass 1",
			"Synth Brass 2",

			// Reed
			"Soprano Sax",
			"Alto Sax",
			"Tenor Sax",
			"Baritone Sax",
			"Oboe",
			"English Horn",
			"Bassoon",
			"Clarinet",

			// Pipe
			"Piccolo",
			"Flute",
			"Recorder",
			"Pan Flute",
			"Blown bottle",
			"Shakuhachi",
			"Whistle",
			"Ocarina",

			// Synth Lead
			"Lead 1 (square)",
			"Lead 2 (sawtooth)",
			"Lead 3 (calliope)",
			"Lead 4 (chiff)",
			"Lead 5 (charang)",
			"Lead 6 (voice)",
			"Lead 7 (fifths)",
			"Lead 8 (bass + lead)",

			// Synth Pad
			"Pad 1 (new age)",
			"Pad 2 (warm)",
			"Pad 3 (polysynth)",
			"Pad 4 (choir)",
			"Pad 5 (bowed)",
			"Pad 6 (metallic)",
			"Pad 7 (halo)",
			"Pad 8 (sweep)",

			// Synth Effects
			"FX 1 (rain)",
			"FX 2 (soundtrack)",
			"FX 3 (crystal)",
			"FX 4 (atmosphere)",
			"FX 5 (brightness)",
			"FX 6 (goblins)",
			"FX 7 (echoes)",
			"FX 8 (sci-fi)",

			// Ethnic
			"Sitar",
			"Banjo",
			"Shamisen",
			"Koto",
			"Kalimba",
			"Bagpipe",
			"Fiddle",
			"Shanai",

			// Percussive
			"Tinkle Bell",
			"Agogo",
			"Steel Drums",
			"Woodblock",
			"Taiko Drum",
			"Melodic Tom",
			"Synth Drum",
			"Reverse Cymbal",

			// Sound Effects
			"Guitar Fret Noise",
			"Breath Noise",
			"Seashore",
			"Bird Tweet",
			"Telephone Ring",
			"Helicopter",
			"Applause",
			"Gunshot",

			// Percussion
			"Bass Drum 2",
			"Bass Drum 1",
			"Side Stick/Rimshot",
			"Snare Drum 1",
			"Hand Clap",
			"Snare Drum 2",
			"Low Tom 2",
			"Closed Hi-hat",
			"Low Tom 1",
			"Pedal Hi-hat",
			"Mid Tom 2",
			"Open Hi-hat",
			"Mid Tom 1",
			"High Tom 2",
			"Crash Cymbal 1",
			"High Tom 1",
			"Ride Cymbal 1",
			"Chinese Cymbal",
			"Ride Bell",
			"Tambourine",
			"Splash Cymbal",
			"Cowbell",
			"Crash Cymbal 2",
			"Vibra Slap",
			"Ride Cymbal 2",
			"High Bongo",
			"Low Bongo",
			"Mute High Conga",
			"Open High Conga",
			"Low Conga",
			"High Timbale",
			"Low Timbale",
			"High Agogô",
			"Low Agogô",
			"Cabasa",
			"Maracas",
			"Short Whistle",
			"Long Whistle",
			"Short Güiro",
			"Long Güiro",
			"Claves",
			"High Wood Block",
			"Low Wood Block",
			"Mute Cuíca",
			"Open Cuíca",
			"Mute Triangle",
			"Open Triangle",    
		]
	};

	constructor() {
		super();

		this.buffered = new Float32Array();
		const audioContext = new AudioContext();
		const stream = audioContext.createScriptProcessor(/* bufferSize */ 512, /* inputs */ 0, /* outputs */ 1);
		stream.connect(audioContext.destination);

		const audioOutputY = audioContext.createGain();
		audioOutputY.gain.value = 2;
		stream.connect(audioOutputY);

		const audioOutputX = audioContext.createGain();
		audioOutputX.gain.value = 15;
		stream.connect(audioOutputX);

		this.setState({ audioContext, audioOutput: stream, audioOutputX, audioOutputY });

		this.firmware = new Firmware();
		this.firmware.connected.then(() => {
			const modelAsJSON = localStorage.getItem('model');
			if (modelAsJSON) {
				this.setState({ model: JSON.parse(modelAsJSON) });
				return this.sync();
			} else {
				return this.reset();
			}
		}).then(() => {
			stream.onaudioprocess = e => {
				const outputBuffer = e.outputBuffer;
				this.firmware.sample(outputBuffer.length, outputBuffer.sampleRate).then(buffer => {
					this.buffered = buffer;
				});

				outputBuffer.getChannelData(0).set(this.buffered);
			};

			navigator.requestMIDIAccess().then(
				midi => {
					midi.inputs.forEach(device => {
						device.open().then(() => {
							device.onmidimessage = ev => {
								this.processMidi(ev.data);
								this.firmware.midi(ev.data);
							}
						});
					});
				});

			this.setState({ ready: true });
		});
	}

	set = (path, value) => {
		this.setState(uc.set(path, value, this.state));
		localStorage.setItem('model', JSON.stringify(this.state.model));
	}

	sync = () => this.firmware.sync(this.state.model);

	syncInstrument = () => {
		const state = this.state;
		const model = state.model;
		const channel = model.currentChannel;
		const program = model.channelToInstrument[channel];
		this.firmware.programChange(channel, program);
	}

	syncWavetable = () => {
		this.firmware.setWavetable(0, new Int8Array(this.state.model.wavetable));
	}

	reset = () => this.firmware.reset((path, value) => {
		this.set(['model'].concat(path), value);
	}).then(() => {
		const state = this.state;
		const instruments = state.model.instruments;
		instruments.forEach((instrument, index) => {
			instruments[index].name = state.instrumentNames[index];
		});
	});

	actions = {
		setWave: (index, value) => {
			this.set(['model', 'wavetable', index], value);
			this.syncWavetable();
		},
		setWavetable: (value) => {
			this.set(['model', 'wavetable'], value);
			this.syncWavetable();
		},
		updateWavetable: (start, end, fn) => {
			const slice = this.state.model.wavetable.slice(start, end);
			fn(slice);
			const newWavetable = this.state.model.wavetable.slice(0);
			newWavetable.splice(start, end - start, ...slice);
			this.set(['model', 'wavetable'], newWavetable);
			this.syncWavetable();
		},
		noteOn: () => {
			this.firmware.noteOn(0, 48, 127, 0);
		},
		noteOff: () => {
			this.firmware.noteOff(0, 48);
		},
		selectInstrument: (value) => {
			const state = this.state;
			const channel = state.model.currentChannel;
			this.set(['model', 'channelToInstrument', channel], value);
			this.firmware.programChange(channel, value);
		},
		selectChannel: (value) => {
			this.set(['model', 'currentChannel'], value);
		},
		updateInstrument: (path, value) => {
			const state = this.state;
			const model = state.model;
			const channel = model.currentChannel;
			const program = model.channelToInstrument[channel];
			this.set(['model', 'instruments', program].concat(path), value);
			this.firmware.setInstruments(this.state.model.instruments).then(() => {
				this.syncInstrument();
			});
		},
		updateInstrumentAt: (index, path, value) => {
			const state = this.state;
			const model = state.model;
			this.set(['model', 'instruments', index].concat(path), value);
			this.firmware.setInstruments(this.state.model.instruments).then(() => {
				this.syncInstrument();
			});
		},
		setLerpStage: (path, value) => {
			this.set(`model.lerpStages${path}`,value);
			this.firmware.setLerpStages(this.state.model.lerpStages);
			this.syncInstrument();
		},
		reset: () => {
			this.reset();
		}
	};

	processMidi = (data) => {
		if (this.state.trackMidi) {
			this.set('lastMidiMessage', data);
			if (data[0] & 0x80) {
				const status = data[0] & 0xF0;
				const channel = data[0] & 0x0F;
				switch (status) {
					case 0xC0:
						this.set(['model', 'channelToInstrument', channel], data[1]);
						break;
					case 0x90:
						if (channel === 0x09) {
							this.set(['model', 'channelToInstrument', channel], data[1] - 35 + 0x80);
						}
						break;
				}
			}
		}
	}

	render(props, state) {
		return (
			<div id="app">
				<Header />
				<Router onChange={this.handleRoute}>
					<Play path="/"
						appState={ state } />
					<Home path="/edit/"
						appState={ state }
						actions={ this.actions } />
					<Code path="/code/" appState={ state } />
					<Import path="/import/"
						appState={ state }
						actions={ this.actions } />
					<Settings path="/settings/" actions={ this.actions } />
				</Router>
			</div>
		);
	}
}
