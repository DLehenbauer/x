import Scope from '../../components/scope';
import WaveEditor from '../../components/waveeditor';
import EnvelopeEditor from '../../components/envelopeeditor';
import InstrumentEditor from '../../components/instrumenteditor';
import ArraySelector from '../../components/arrayselector';
import { h, Component } from 'preact';
import style from './style';

// High pass FIR at ~7760hz
const hiPass = [-0.075579, 0.800000, -0.075579];

// Low pass FIR at ~7760hz
const loPass = [0.187098, 0.800000, 0.187098];

// Gaussian Low-Pass for smoothing wave edges for zero-crossing
const zeroCross = [0.028532, 0.067234, 0.124009, 0.179044, 0.20236, 0.179044, 0.124009, 0.067234, 0.028532];

const channels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

export default class Import extends Component {
	state = {
        isEditing: false,
        sample: new Int8Array(),
        srcOffset: 0,
        srcSize: 256,
        destSize: 256
	}

    onCopy = () => {
        const state = this.state;
        const src = state.sample;
        const srcStart = state.srcOffset;
        const srcSize = state.srcSize;
        const srcEnd = srcStart + srcSize;

        const destStart = this.currentInstrument.waveOffset;
        const destSize = state.destSize;
        const destEnd = destStart + destSize;

        const ratio = 1 / destSize;

        let j = 0;
        for (let i = destStart; i < destEnd; i++) {
            const srcIndex = Math.round((1 - j) * srcStart + j * srcEnd);
            const sample = Math.round(src[srcIndex]);
            
            this.props.actions.setWave(i, sample);

            j += ratio;
        }
    }

	editModeChanged = e => {
		this.setState({ isEditing: e.target.checked })
	}

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

    readSingleFile = e => {
        const file = e.target.files[0];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = e => {
            const contents = e.target.result;
            this.props.appState.audioContext.decodeAudioData(contents).then(decoded => {
                const f32 = decoded.getChannelData(0);
                const i8 = f32.map(value => value * 127);
                this.setState({ sample: i8 })
            });
        };
        reader.readAsArrayBuffer(file);
    }
      
    displayContents(contents) {
        var element = document.getElementById('file-content');
        element.textContent = contents;
    }
      
	setSrcOffset = value => this.setState({ srcOffset: value })
	setSrcSize = value => this.setState({ srcSize: value })

    setDestOffset = value => this.props.actions.updateInstrument(['waveOffset'], value);
	setDestSize = value => this.setState({ destSize: value })

    render(props, state) {
		const app = props.appState;
		if (!app.ready) {
			return;
		}

		const model = app.model;
		const actions = props.actions;
		const waveOffset = this.currentInstrument.waveOffset;

		return (
			<div class={style.home}>
            <input type="file" id="file-input" onchange={this.readSingleFile} />
				<WaveEditor 
					waveStyle={ style.waveEditor }
					wave={ state.sample }
					selectionStart={ state.srcOffset }
					selectionSize={ state.srcSize }
					xor={ 0 }
					setWave={ actions.setWave }
					setOffset={ this.setSrcOffset }
                    setSelectionSize={ this.setSrcSize } />
				<button onclick={ this.onCopy }>Copy</button>
				<WaveEditor 
					waveStyle={ style.waveEditor }
					wave={ model.persistant.synth.wavetable }
					selectionStart={ waveOffset }
					selectionSize={ state.destSize }
					xor={ this.currentInstrument.xor }
					setWave={ actions.setWave }
                    setOffset={ this.setDestOffset }
                    setSelectionSize={ this.setDestSize } />
			</div>
		);
	}
}
