import Scope from '../../components/scope';
import { h, Component } from 'preact';
import style from './style';

export default class Home extends Component {
	constructor() {
		super();

		if (typeof window !== 'undefined') {
			let buffered = null;

			const worker = new Worker('../../firmware/worker.js');
			
			worker.addEventListener('message', e => {
				const msg = e.data;
				switch (msg.type) {
					case 'audio': {
						buffered = new Float32Array(msg.buffer);
						break;
					}
				}
			});

			const synth = {
				midi: (data) => worker.postMessage({
					type: 'midi', data
				}),
				noteOn: (channel, note, velocity) => worker.postMessage({
					type: 'noteOn', channel, note, velocity
				}),
				noteOff: (channel, note) => worker.postMessage({
					type: 'noteOff', channel, note
				}),
				sample: (length, rate) => worker.postMessage({
					type: 'sample', length, rate
				})
			}

			navigator.requestMIDIAccess().then( 
				midi => {
					midi.inputs.forEach(device => {
						device.open().then(() => {
							device.onmidimessage = ev => {
								synth.midi(ev.data);
							}
						});
					});
				});

			const audioContext = new AudioContext();
			const stream = audioContext.createScriptProcessor(/* bufferSize */ 512, /* inputs */ 0, /* outputs */ 1);
			stream.onaudioprocess = e => {
				const outputBuffer = e.outputBuffer;
				synth.sample(outputBuffer.length, outputBuffer.sampleRate);
				outputBuffer.getChannelData(0).set(buffered);
				buffered = null;
			};

			const lowpass = audioContext.createBiquadFilter();
			lowpass.type = 'lowpass';
			lowpass.Q.value = 0.01;
			lowpass.frequency.value = 19200/4;
			stream.connect(lowpass);

			const gain = audioContext.createGain();
			gain.gain.value = 12.0;
			lowpass.connect(gain);
			gain.connect(audioContext.destination);

			this.setState({ audioContext, synth, source: gain });
		}
	}

	startClicked = () => {
		this.state.synth.noteOn(0, 48, 127, 0);
	}

	stopClicked = () => {
		this.state.synth.noteOff(0);
	}

	render() {
		return (
			<div class={style.home}>
				<button onclick={this.startClicked}>Start</button>
				<button onclick={this.stopClicked}>Stop</button>
				Scope:
				<div class={style.scope}>
				  <Scope audioContext={ this.state.audioContext } source={ this.state.source }></Scope>
				</div>
			</div>
		);
	}
}
