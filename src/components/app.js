import { h, Component } from 'preact';
import { Router } from 'preact-router';

import Header from './header';
import Home from '../routes/home';
import Profile from '../routes/profile';
// import Home from 'async!../routes/home';
// import Profile from 'async!../routes/profile';

import Firmware from '../firmware/firmware-client';
import * as uc from 'unchanged';

if (module.hot) {
	require('preact/debug');
}

export default class App extends Component {
	state = {
		wavetable: [],
		currentChannel: 0,
		channelToInstrument: [0],
		instruments: [{
			name: "Acoustic Grand Piano",
			waveOffset: 0,
			ampMod: 0,
			freqMod: 0,
			xor: 0,
			instrumentFlags: 0
		}],
		lerpStages: [],
		lerpProgressions: [],
		lerpPrograms: []
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
			this.firmware.getWavetable().then(bytes => {
				this.setState({ wavetable: bytes })
			});

			this.firmware.getLerpStages().then(bytes => {
				this.setState({ lerpStages: bytes })
			});

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
		})
	}

	set = (path, value) => {
		this.setState(uc.set(path, value, this.state));
	}

	actions = {
		setWavetable: (index, value) => {
			this.set(['wavetable', index], value);
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
			this.set(['instruments', state.channelToInstrument[state.currentChannel]].concat(path), value);
		},
		setLerpStage: (path, value) => {
			this.set(`lerpStages${path}`, value);
			this.firmware.setLerpStages(this.state.lerpStages);
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
						instrument={ state.instruments[state.channelToInstrument[state.currentChannel]] }
						/>
					<Profile path="/profile/" user="me" />
					<Profile path="/profile/:user" />
				</Router>
			</div>
		);
	}
}
