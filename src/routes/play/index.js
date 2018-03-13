import Scope from '../../components/scope';
import MidiMessages from '../../components/midimessages';
import { h, Component } from 'preact';
import style from './style';

export default class Home extends Component {
    hex8(value) {
        const hex = (value & 0xFF).toString(16);
        return "00".substr(hex.length) + hex;
    }

    render(props, state) {
		const app = props.appState;
		if (!app.ready) {
			return;
		}

		const model = app.model;
		const actions = props.actions;
        const hex = Array.prototype.map.call(app.lastMidiMessage, value => this.hex8(value));

		return (
			<div class={style.home}>
				Scope:
				<div class={style.scope}>
				  	<Scope audioContext={ app.audioContext } source={ app.audioOutputY } />
				</div>
                <div>{hex}</div>
			</div>
		);
	}
}
