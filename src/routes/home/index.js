import Scope from '../../components/scope';
import { h, Component } from 'preact';
import style from './style';

export default class Home extends Component {
	constructor() {
		super();

		if (typeof window !== 'undefined') {
			let buffered = null;

			const worker = new Worker('../../firmware/synth-worker.js');
			
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
				noteOn: (voice, note, velocity, instrument) => worker.postMessage({
					type: 'noteOn', voice, note, velocity, instrument
				}),
				noteOff: (voice) => worker.postMessage({
					type: 'noteOff', voice
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
								const cmd = ev.data[0] >> 4;
								const channel = ev.data[0] & 0xf;
								const noteNumber = ev.data[1];
								const velocity = ev.data.length > 2 ? ev.data[2] : 0;
							
								// MIDI noteon with velocity=0 is the same as noteoff
								if (cmd ===8 || ((cmd === 9) && (velocity === 0))) {
									synth.noteOff(0);
								} else if (cmd == 9) { // note on
									synth.noteOn(0, noteNumber, velocity, 0);
								}
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
