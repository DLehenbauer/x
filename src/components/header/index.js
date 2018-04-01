import { h, Component } from 'preact';
import { Link } from 'preact-router/match';
import style from './style';
import ArraySelector from '../arrayselector';
import Midi from '../../common/midi';

const channels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

export default class Header extends Component {
	get currentInstrumentIndex() {
		const model = this.props.appState.model;
		return model.channelToInstrument[model.currentChannel];
	}

	get currentInstrument() {
		const model = this.props.appState.model;
		return model.persistant.synth.instruments[this.currentInstrumentIndex];
	}

	get currentChannel() {
		const model = this.props.appState.model;
		return model.currentChannel;
	}

	instrumentSelected = index => {
		this.props.actions.selectInstrument(index);
		this.state.selectionSize = 256;
	}

	channelSelected = index => { this.props.actions.selectChannel(index); }

	resetClicked = () => { this.props.actions.reset(); }

	render() {
		const instrumentNames = Midi.instrumentNames.map((name, index) => `${index}: ${name}`);

		return (
			<header class={style.header}>
				<h1>Synth</h1>
				<ArraySelector onselect={this.channelSelected} selectedIndex={this.currentChannel} options={channels} />
				<ArraySelector onselect={this.instrumentSelected} selectedIndex={this.currentInstrumentIndex} options={instrumentNames} />
				<span class={style.icon} onclick={this.resetClicked}>&#x21bb;</span>
				<nav>
					<Link activeClassName={style.active} href="/">Play</Link>
					<Link activeClassName={style.active} href="/edit">Edit</Link>
					<Link activeClassName={style.active} href="/code">Code</Link>
					<Link activeClassName={style.active} href="/import">Import</Link>
					<Link activeClassName={style.active} href="/settings"><div class={style.icon}>&#x2699;</div></Link>
				</nav>
			</header>
		);
	}
}
