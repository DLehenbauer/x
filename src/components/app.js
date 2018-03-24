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
		},
	};

	constructor() {
		super();

		this.buffered = new Float32Array();
		const audioContext = new AudioContext();
		const stream = audioContext.createScriptProcessor(/* bufferSize */ 512, /* inputs */ 0, /* outputs */ 1);
		stream.connect(audioContext.destination);

		const audioOutputY = audioContext.createGain();
		audioOutputY.gain.value = 4;
		stream.connect(audioOutputY);

		const audioOutputX = audioContext.createGain();
		audioOutputX.gain.value = 15;
		stream.connect(audioOutputX);

		this.setState({ audioContext, audioOutput: stream, audioOutputX, audioOutputY });

		this.firmware = new Firmware();
		this.firmware.connected.then(() => {
			return this.loadFirmware().then(() => {
				this.set(['firmwareDefaults'], this.state.model);
				const modelAsJSON = localStorage.getItem('model');
				if (modelAsJSON) {
					this.set(['model'], JSON.parse(modelAsJSON));
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

	set = (path, value) => {
		this.setState(uc.set(path, value, this.state));
		localStorage.setItem('model', JSON.stringify(this.state.model));
	}

	storeFirmware = () => this.firmware.storeAll(this.state.model);

	syncInstrument = () => {
		const state = this.state;
		const model = state.model;
		const channel = model.currentChannel;
		const program = model.channelToInstrument[channel];
		this.firmware.programChange(channel, program);
	}

	syncWavetable = () => {
		this.firmware.setWavetable(new Int8Array(this.state.model.wavetable));
	}

	loadFirmware = () => this.firmware.loadAll((path, value) => {
		this.set(['model'].concat(path), value);
	}).then(() => {
		const state = this.state;
		const instruments = state.model.instruments;
		instruments.forEach((instrument, index) => {
			instruments[index].name = Midi.instrumentNames[index];
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
			const state = this.state;
			const model = state.model;
			const channel = model.currentChannel;
			const program = model.channelToInstrument[channel];

			let note = 48;
			if (program >= 0x80) {
				note = model.percussionNotes[program - 0x80];
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
			this.set(['model', 'instruments', program].concat(path), value);
			this.firmware.setInstruments(this.state.model.instruments);
			this.syncInstrument();
		},
		updateInstrumentAt: (index, path, value) => {
			const state = this.state;
			const model = state.model;
			this.set(['model', 'instruments', index].concat(path), value);
			this.firmware.setInstruments(this.state.model.instruments);
			this.syncInstrument();
		},
		setPercussionNote: (index, value) => {
			const state = this.state;
			const model = state.model;
			this.set(['model', 'percussionNotes', index - 0x80], value);
			this.firmware.setPercussionNotes(this.state.model.percussionNotes);
			this.syncInstrument();
		},
		setLerpStage: (path, value) => {
			this.set(`model.lerpStages${path}`,value);
			this.firmware.setLerpStages(this.state.model.lerpStages);
			this.syncInstrument();
		},
		setLerps: (stages, programs) => {
			this.set(['model', 'lerpStages'], stages);
			this.firmware.setLerpStages(this.state.model.lerpStages);

			this.set(['model', 'lerpPrograms'], programs);
			this.firmware.setLerpPrograms(this.state.model.lerpPrograms);

			this.syncInstrument();
		},
		reset: () => {
			this.set(['model'], this.state.firmwareDefaults);
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
				<Header reset={ this.actions.reset } />
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