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
import Midi from '../common/midi';
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
			persistant: {
				synth: {}
			}
		},
	};

	constructor() {
		super();

		this.buffered = new Float32Array();
		if (typeof window !== "undefined") {
			const audioContext = new AudioContext();
			const stream = audioContext.createScriptProcessor(/* bufferSize */ 512, /* inputs */ 0, /* outputs */ 1);

			const audioOutputZ = audioContext.createGain();
			audioOutputZ.gain.setValueAtTime(2, audioContext.currentTime);
			stream.connect(audioOutputZ);
			audioOutputZ.connect(audioContext.destination);

			const audioOutputY = audioContext.createGain();
			audioOutputY.gain.setValueAtTime(4, audioContext.currentTime);
			stream.connect(audioOutputY);

			const audioOutputX = audioContext.createGain();
			audioOutputX.gain.setValueAtTime(15, audioContext.currentTime);
			stream.connect(audioOutputX);

			this.setState({ audioContext, audioOutput: stream, audioOutputX, audioOutputY });

			const persistantAsJSON = localStorage.getItem('persistant');

			this.firmware = new Firmware();
			this.firmware.connected.then(() => {
				return this.loadFirmware().then(() => {
					this.set(['firmwareDefaults'], this.state.model.persistant.synth);
					if (persistantAsJSON) {
						this.set(['model', 'persistant', 'synth'], JSON.parse(persistantAsJSON));
					}
					return this.storeFirmware();
				});
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
	}

	set = (path, value) => {
		this.setState(uc.set(path, value, this.state));
		localStorage.setItem('synth', JSON.stringify(this.state.model.persistant.synth));
	}

	storeFirmware = () => this.firmware.storeAll(this.state.model.persistant.synth);

	syncInstrument = () => {
		const state = this.state;
		const model = state.model;
		const channel = model.currentChannel;
		const program = model.channelToInstrument[channel];
		this.firmware.programChange(channel, program);
	}

	syncWavetable = () => {
		this.firmware.setWavetable(new Int8Array(this.state.model.persistant.synth.wavetable));
	}

	loadFirmware = () => this.firmware.loadAll((path, value) => {
		this.set(['model', 'persistant', 'synth'].concat(path), value);
	}).then(() => {
		const state = this.state;
		const instruments = state.model.persistant.synth.instruments;
		instruments.forEach((instrument, index) => {
			instruments[index].name = Midi.instrumentNames[index];
		});
	});

	actions = {
		setWave: (index, value) => {
			this.set(['model', 'persistant', 'synth', 'wavetable', index], value);
			this.syncWavetable();
		},
		setWavetable: (value) => {
			this.set(['model', 'persistant', 'synth', 'wavetable'], value);
			this.syncWavetable();
		},
		updateWavetable: (start, end, fn) => {
			const slice = this.state.model.persistant.synth.wavetable.slice(start, end);
			fn(slice);
			const newWavetable = this.state.model.persistant.synth.wavetable.slice(0);
			newWavetable.splice(start, end - start, ...slice);
			this.set(['model', 'persistant', 'synth', 'wavetable'], newWavetable);
			this.syncWavetable();
		},
		noteOn: () => {
			const state = this.state;
			const model = state.model;
			const channel = model.currentChannel;
			const program = model.channelToInstrument[channel];

			let note = 48;
			if (program >= 0x80) {
				note = model.persistant.synth.percussionNotes[program - 0x80];
			}
			
			this.firmware.noteOn(0, note, 127, 0);
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
			this.set(['model', 'persistant', 'synth', 'instruments', program].concat(path), value);
			this.firmware.setInstruments(this.state.model.persistant.synth.instruments);
			this.syncInstrument();
		},
		updateInstrumentAt: (index, path, value) => {
			const state = this.state;
			const model = state.model;
			this.set(['model', 'persistant', 'synth', 'instruments', index].concat(path), value);
			this.firmware.setInstruments(this.state.model.persistant.synth.instruments);
			this.syncInstrument();
		},
		setPercussionNote: (index, value) => {
			const state = this.state;
			const model = state.model;
			this.set(['model', 'persistant', 'synth', 'percussionNotes', index - 0x80], value);
			this.firmware.setPercussionNotes(this.state.model.persistant.synth.percussionNotes);
			this.syncInstrument();
		},
		setLerpStage: (path, value) => {
			this.set(`model.persistant.synth.lerpStages${path}`,value);
			this.firmware.setLerpStages(this.state.model.persistant.synth.lerpStages);
			this.syncInstrument();
		},
		setLerps: (stages, programs) => {
			this.set(['model', 'persistant', 'synth', 'lerpStages'], stages);
			this.firmware.setLerpStages(this.state.model.persistant.synth.lerpStages);

			this.set(['model', 'persistant', 'synth', 'lerpPrograms'], programs);
			this.firmware.setLerpPrograms(this.state.model.persistant.synth.lerpPrograms);

			this.syncInstrument();
		},
		reset: () => {
			this.set(['model', 'persistant', 'synth'], this.state.firmwareDefaults);
			return this.storeFirmware();
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
				<Header actions={ this.actions } appState={ state } />
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