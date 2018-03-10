import Scope from '../../components/scope';
import WaveEditor from '../../components/waveeditor';
import Lerp from '../../components/lerp';
import LerpEditor from '../../components/lerpeditor';
import ArraySelector from '../../components/arrayselector';
import { h, Component } from 'preact';
import style from './style';

export default class Home extends Component {
	state = {
		isEditing: false
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

	editModeChanged = e => {
		this.setState({ isEditing: e.target.checked })
	}

	get currentInstrument() {
		const model = this.props.appState.model;
		return model.channelToInstrument[model.currentChannel];
	}

	instrumentSelected = index => {
		this.props.actions.selectInstrument(index);
	}

	render(props, state) {
		const app = props.appState;
		if (!app.ready) {
			return;
		}

		const model = app.model;
		const actions = props.actions;
		const instrumentNames = app.instrumentNames.map((name, index) => `${index}: ${name}`);

		return (
			<div class={style.home}>
				<ArraySelector onselect={this.instrumentSelected} selectedIndex={this.currentInstrument} options={instrumentNames} />
				<button onclick={this.startClicked}>Start</button>
				<button onclick={this.stopClicked}>Stop</button>
				Scope:
				<div class={style.scope}>
				  	<Scope audioContext={ app.audioContext } source={ app.audioOutputX } />
				</div>
				<div style='overflow-x: scroll; overflow-y: hidden'>
					<div class={style.waveEditor} style={`width: ${model.wavetable.length}px`}>
						<WaveEditor 
							isEditing={ state.isEditing }
							instrument={ props.instrument }
							wave={ model.wavetable }
							setWave={ actions.setWavetable }
							updateInstrument={ actions.updateInstrument } />
					</div>
				</div>
				<input type='checkbox' onchange={this.editModeChanged}></input><label>Edit</label>
				<div class={style.lerp}>
					<Lerp appState={ app } program={ model.instruments[this.currentInstrument].ampMod } />
				</div>
				<LerpEditor appState={ app } actions={ actions } />
			</div>
		);
	}
}
