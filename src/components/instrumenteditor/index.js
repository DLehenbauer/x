import { h, Component } from 'preact';
import style from './style';
import ArraySelector from '../arrayselector';

export default class InstrumentEditor extends Component {
    flags = [
        { name: 'noise', mask: (1 << 0) },
        { name: 'halfAmp', mask: (1 << 1) },
    ];

    instrumentChanged = e => {
        const target = e.target;
        const path = `${target.name}`
        this.props.actions.updateInstrument(path, parseInt(target.value));
    };

    flagChanged = e => {
        const target = e.target;
        const mask = parseInt(target.name);
        const flags = target.checked
            ? this.currentInstrument.flags | mask
            : this.currentInstrument.flags & ~mask;

        this.props.actions.updateInstrument('flags', flags);
    };

	get currentInstrumentIndex() {
		const model = this.props.appState.model;
		return model.channelToInstrument[model.currentChannel];
	}

	get currentInstrument() {
		const model = this.props.appState.model;
		return model.instruments[this.currentInstrumentIndex];
	}

	render(props, state) {
        const app = this.props.appState;
        if (!app.ready) {
            return;
        }

        const model = app.model;
        const instrument = this.currentInstrument;

        const rows = [];
        this.flags.forEach((flag) => {
            rows.push(
                <div class={style.stage}>
                    <span>{flag.name}</span>
                    <input name={flag.mask} type='checkbox' checked={ instrument.flags & flag.mask } onchange={ this.flagChanged } />
                </div>
            );
        });

		return (
            <div>
                <div class={style.stage}>
                    <span>Xor:</span>
                    <input name='xor' type='range' min='0' max='127' value={ instrument.xor } onchange={ this.instrumentChanged } />
                </div>
                {rows}
            </div>
		);
	}
}