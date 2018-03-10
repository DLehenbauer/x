import Scope from '../../components/scope';
import MidiMessages from '../../components/midimessages';
import { h, Component } from 'preact';
import style from './style';

export default class Home extends Component {
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
				Scope:
				<div class={style.scope}>
				  	<Scope audioContext={ app.audioContext } source={ app.audioOutputY } />
				</div>
                <MidiMessages messages={app.midiMessages}></MidiMessages>
			</div>
		);
	}
}
