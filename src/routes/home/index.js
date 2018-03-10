import Scope from '../../components/scope';
import WaveEditor from '../../components/waveeditor';
import Lerp from '../../components/lerp';
import LerpEditor from '../../components/lerpeditor';
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

	previousInstrument = () => {
		this.props.actions.selectInstrument(this.currentInstrument - 1);
	}

	nextInstrument = () => {
		this.props.actions.selectInstrument(this.currentInstrument + 1);
	}

	instrumentSelected = e => {
		const instrument = parseInt(e.target.selectedOptions[0].value);
		this.props.actions.selectInstrument(instrument);
	}

	render(props, state) {
		const app = props.appState;
		if (!app.ready) {
			return;
		}

		const model = app.model;
		const actions = props.actions;
		const currentInstrument = this.currentInstrument;
		const maxInstrument = app.instrumentNames.length - 1;
		const instruments = app.instrumentNames.map((name, index) => {
			const selected = index === currentInstrument;
			return (
				<option value={index} selected={selected}>{index}: {name}</option>	
			);
		});

		return (
			<div class={style.home}>
				<button onclick={this.previousInstrument} disabled={currentInstrument <= 0}>&#x25c0;</button>
				<select onchange={this.instrumentSelected}>{instruments}</select>
				<button onclick={this.nextInstrument} disabled={currentInstrument >= maxInstrument}>&#x25ba;</button>
				<button onclick={this.startClicked}>Start</button>
				<button onclick={this.stopClicked}>Stop</button>
				Scope:
				<div class={style.scope}>
				  	<Scope audioContext={ app.audioContext } source={ app.audioOutput } />
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
					<Lerp stages={ app.model.lerpStages } />
				</div>
				<LerpEditor appState={ app } actions={ actions } />
			</div>
		);
	}
}
