import { h, Component } from 'preact';
import style from './style';
import ArraySelector from '../arrayselector';

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export default class InstrumentEditor extends Component {
    flags = [
        { name: 'noise', mask: (1 << 0) },
        { name: 'halfAmp', mask: (1 << 1) },
        { name: 'selAmp', mask: (1 << 2) },
        { name: 'selWave', mask: (1 << 3) },
    ];

	get currentInstrumentIndex() {
		const model = this.props.appState.model;
		return model.channelToInstrument[model.currentChannel];
	}

	get currentInstrument() {
		const model = this.props.appState.model;
		return model.instruments[this.currentInstrumentIndex];
	}

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

    noteChanged = e => {
        this.props.actions.setPercussionNote(this.currentInstrumentIndex, parseInt(e.target.value));
    }

	render(props, state) {
        const app = this.props.appState;
        if (!app.ready) {
            return;
        }

        const model = app.model;
        const instrument = this.currentInstrument;

        const rows = [];

        const instrumentIndex = this.currentInstrumentIndex;
        if (instrumentIndex >= 0x80) {
            const note = model.percussionNotes[this.currentInstrumentIndex - 0x80];
            const noteName = `${noteNames[note % 12]}${Math.floor(note / 12)}`;
            rows.push(
                <div class={style.stage}>
                    <span>Percussion Note:</span>
                    <input type='number' value={ note } min='0' max='127' oninput={ this.noteChanged } />
                    <span>{ noteName }</span>
                </div>
            )
        }

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