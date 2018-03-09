import { h, Component } from 'preact';
import { Router } from 'preact-router';

import Header from './header';
import Home from '../routes/home';
import Settings from '../routes/settings';
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
		model: {
			currentChannel: 0,
			channelToInstrument: [0],
			wavetable: [],
			instruments: [{
				name: "Acoustic Grand Piano",
				waveOffset: 0,
				ampMod: 0,
				freqMod: 0,
				xor: 0,
				instrumentFlags: 0
			}]
		}
	};

	constructor() {
		super();

		this.buffered = new Float32Array();
		const audioContext = new AudioContext();
		const stream = audioContext.createScriptProcessor(/* bufferSize */ 512, /* inputs */ 0, /* outputs */ 1);
		stream.connect(audioContext.destination);

		this.setState({ audioContext, audioOutput: stream });

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

	sync = () => {
		const state = this.state;
		return Promise.all([
			this.firmware.setWavetable(0, state.model.wavetable),
			this.firmware.setInstruments(state.model.instruments),
			this.firmware.setLerpStages(state.model.lerpStages),
		]);
	}

	reset = () => {
		const instruments = this.firmware.getInstruments();
		const wavetable = this.firmware.getWavetable();
		const lerpPrograms = this.firmware.getLerpPrograms();
		const lerpProgressions = this.firmware.getLerpProgressions();
		const lerpStages = this.firmware.getLerpStages();

		return Promise.all([instruments, wavetable, lerpPrograms, lerpProgressions, lerpStages]).then(values => {
			this.set(['model', 'instruments'], values[0]);
			this.set(['model', 'wavetable'], values[1]);
			this.set(['model', 'lerpPrograms'], values[2]);
			this.set(['model', 'lerpProgressions'], values[3]);
			this.set(['model', 'lerpStages'], values[4]);
		});
	}

	actions = {
		setWavetable: (index, value) => {
			this.set(['model', 'wavetable', index], value);
			this.firmware.setWavetable(0, new Int8Array(this.state.wavetable));
		},
		noteOn: () => {
			this.firmware.noteOn(0, 48, 127, 0);
		},
		noteOff: () => {
			this.firmware.noteOff(0, 48);
		},
		updateInstrument: (path, value) => {
			const state = this.state;
			const model = state.model;
			this.set(['model', 'instruments', model.channelToInstrument[model.currentChannel]].concat(path), value);
			this.firmware.setInstruments(this.state.model.instruments);
			this.firmware.midi([0xC0, 0x00]);
		},
		setLerpStage: (path, value) => {
			this.set(`model.lerpStages${path}`, value);
			this.firmware.setLerpStages(this.state.model.lerpStages);
		},
		reset: () => {
			this.reset(new Firmware());
		}
	};

	render(props, state) {
		return (
			<div id="app">
				<Header />
				<Router onChange={this.handleRoute}>
					<Home path="/"
						appState={ state }
						actions={ this.actions } 
						instrument={ state.model.instruments[state.model.channelToInstrument[state.model.currentChannel]] }
						/>
					<Settings path="/settings/" actions={ this.actions } />
				</Router>
			</div>
		);
	}
}
