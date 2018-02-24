import Scope from '../../components/scope';
import WaveEditor from '../../components/waveeditor';
import { h, Component } from 'preact';
import style from './style';

export default class Home extends Component {
	constructor() {
		super();

		if (typeof window !== 'undefined') {
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
		}
	}

	setWave = (index, value) => {
		this.state.wavetable[index] = value;
		this.firmware.setWavetable(0, this.state.wavetable);
	}

	startClicked = () => {
		this.props.actions.noteOn();
	}

	stopClicked = () => {
		this.props.actions.noteOff();
	}

	render(props, state) {
		return (
			<div class={style.home}>
				<button onclick={this.startClicked}>Start</button>
				<button onclick={this.stopClicked}>Stop</button>
				Scope:
				<div class={style.scope}>
				  	<Scope audioContext={ props.audioContext } source={ props.audioOutput } />
				</div>
				<div style='overflow-x: scroll; overflow-y: hidden'>
					<div class={style.waveEditor} style={`width: ${props.wavetable.length}px`}>
						<WaveEditor 
							isEditing={ false }
							instrument={ props.instrument }
							wave={ props.wavetable }
							setWave={ props.actions.setWavetable }
							updateInstrument={ props.actions.updateInstrument }  />
					</div>
				</div>
			</div>
		);
	}
}
