import Scope from '../../components/scope';
import WaveEditor from '../../components/waveeditor';
import { h, Component } from 'preact';
import style from './style';
import Firmware from '../../firmware/firmware-client';

export default class Home extends Component {
	constructor() {
		super();

		if (typeof window !== 'undefined') {
			this.firmware = new Firmware();

			this.buffered = new Float32Array();

			const audioContext = new AudioContext();
			const stream = audioContext.createScriptProcessor(/* bufferSize */ 512, /* inputs */ 0, /* outputs */ 1);

			const lowpass = audioContext.createBiquadFilter();
			lowpass.type = 'lowpass';
			lowpass.Q.value = 0.01;
			lowpass.frequency.value = 19200/4;
			stream.connect(lowpass);

			const gain = audioContext.createGain();
			gain.gain.value = 8.0;
			lowpass.connect(gain);
			gain.connect(audioContext.destination);

			this.setState({ audioContext, source: gain, wavetable: new Int8Array(256) });

			this.firmware.connected.then(() => {
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

				stream.onaudioprocess = e => {
					const outputBuffer = e.outputBuffer;
					this.firmware.sample(outputBuffer.length, outputBuffer.sampleRate).then(buffer => {
						this.buffered = buffer;
					});
	
					outputBuffer.getChannelData(0).set(this.buffered);
				};
			});
		}
	}

	setWave = (index, value) => {
		this.state.wavetable[index] = value;
		this.firmware.setWavetable(0, this.state.wavetable);
	}

	startClicked = () => {
		this.firmware.noteOn(0, 48, 127, 0);
	}

	stopClicked = () => {
		this.firmware.noteOff(0, 48);
		const bytes = new Int8Array(128);
		this.firmware.setWavetable(0, bytes);
	}

	render() {
		return (
			<div class={style.home}>
				<button onclick={this.startClicked}>Start</button>
				<button onclick={this.stopClicked}>Stop</button>
				Scope:
				<div class={style.scope}>
				  <Scope audioContext={ this.state.audioContext } source={ this.state.source } />
				  <WaveEditor isEditing={ true } instrument={{ xor: 0, waveOffset: 0 }} wave={ this.state.wavetable } setWave={ this.setWave } />
				  <LerpEditor />
				</div>
			</div>
		);
	}
}
