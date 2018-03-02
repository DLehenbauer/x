import Scope from '../../components/scope';
import WaveEditor from '../../components/waveeditor';
import Lerp from '../../components/lerp';
import LerpEditor from '../../components/lerpeditor';
import { h, Component } from 'preact';
import style from './style';

export default class Home extends Component {
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
		const app = props.appState;
		if (!app.ready) {
			return;
		}

		const model = app.model;
		const actions = props.actions;

		return (
			<div class={style.home}>
				<button onclick={this.startClicked}>Start</button>
				<button onclick={this.stopClicked}>Stop</button>
				Scope:
				<div class={style.scope}>
				  	<Scope audioContext={ app.audioContext } source={ app.audioOutput } />
				</div>
				<div style='overflow-x: scroll; overflow-y: hidden'>
					<div class={style.waveEditor} style={`width: ${model.wavetable.length}px`}>
						<WaveEditor 
							isEditing={ false }
							instrument={ props.instrument }
							wave={ model.wavetable }
							setWave={ actions.setWavetable }
							updateInstrument={ actions.updateInstrument }  />
					</div>
				</div>
				<div class={style.lerp}>
					<Lerp stages={ app.model.lerpStages } />
				</div>
				<LerpEditor appState={ app } actions={ actions } />
			</div>
		);
	}
}
