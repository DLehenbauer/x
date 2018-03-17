import Scope from '../../components/scope';
import WaveEditor from '../../components/waveeditor';
import LerpEditor from '../../components/lerpeditor';
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
        srcEnd: 256,
        destEnd: 256
	}

    onCopy = () => {
        const state = this.state;
        const src = state.sample;
        const srcStart = state.srcOffset;
        const srcEnd = state.srcEnd;
        const srcSize = srcEnd - srcStart;

        const destStart = this.currentInstrument.waveOffset;
        const destEnd = state.destEnd;
        const destSize = destEnd - destStart;

        const ratio = 1 / destSize;

        let j = 0;
        for (let i = destStart; i < destEnd; i++) {
            const srcIndex = Math.round((1 - j) * srcStart + j * srcEnd);
            const sample = Math.round(src[srcIndex]);
            
            this.props.actions.setWave(i, sample);

            j += ratio;
        }
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

	get currentInstrumentIndex() {
		const model = this.props.appState.model;
		return model.channelToInstrument[model.currentChannel];
	}

	get currentInstrument() {
		const model = this.props.appState.model;
		return model.instruments[this.currentInstrumentIndex];
	}

	get currentChannel() {
		const model = this.props.appState.model;
		return model.currentChannel;
	}

	instrumentSelected = index => {
		this.props.actions.selectInstrument(index);
	}

	channelSelected = index => {
		this.props.actions.selectChannel(index);
	}

	onMoveWave = (delta) => {
		const model = this.props.appState.model;
		const original = this.currentInstrument.waveOffset;
		const limit = model.wavetable.length - 256;
		let updated = Math.round(original / Math.abs(delta)) * Math.abs(delta);
		updated = Math.min(Math.max(0, updated + delta), limit)
	
		this.props.actions.updateInstrument(['waveOffset'], updated);
	}

	onFormulaChanged(e) {
		try {
			this.waveFormula = eval(`(t, i, s, a0, a1) => { const max = Math.max; const min = Math.min; const pi = Math.PI; const sin = Math.sin; const tan = Math.tan; const rand = () => Math.random() * 2 - 1; return (${e.target.value}) * 127; }`);
		} catch (error) {
			this.waveFormula = (t, i, s, a0, a1) => s(i);
			this.waveFormulaBox.setCustomValidity(error);
		}
	}

	createSampler() {
		const wave = this.getWave();
		return (index) => {
			return wave[index & 0xFF];
		};
	}

	createSamplerFromArray(wave) {
		return (index) => {
			return wave[index & 0xFF];
		};		
	}

	modifyWave(fn) {
		const offset = this.currentInstrument.waveOffset;
		const s = this.createSampler();

		this.props.actions.updateWavetable(
			offset, offset + 256,
			wave => {
				const step = 1 / 255;
				let t = 0;
				for (let i = 0; i < 256; i++) {
					const a1 = i/256;
					const a0 = 1 - a1;
					const sample = Math.max(Math.min(Math.round(fn(t, i, i => s(i) / 127, a0, a1)), 127), -127) | 0;
					wave[i] = sample;
					t += step;
				}
			});
	}

	updateWave(fn) {
		const offset = this.currentInstrument.waveOffset;
		this.props.actions.updateWavetable(offset, offset + 256, fn);
	}

	onSetWave() {
		this.modifyWave(this.waveFormula.bind(this));
	}

	getWaveLimits(wave) {
		let min = +Infinity;
		let max = -Infinity;

		for (let i = 0; i < wave.length; i++) {
			min = Math.min(min, wave[i]);
			max = Math.max(max, wave[i]);
		}

		return { min: min, max: max, amplitude: max - min };
	}

	convolve(s, h) {
		const y = new Array(256);
		const m = Math.floor(h.length / 2);
		for (let i = 0; i < 256; i++) {
			y[i] = 0;
			for (let j = 0; j < h.length; j++) {
				y[i] += s(i - j + m) * h[j];
			}
		}

		return y;
	}

	getWaveLimits(wave) {
		let min = +Infinity;
		let max = -Infinity;

		for (let i = 0; i < wave.length; i++) {
			min = Math.min(min, wave[i]);
			max = Math.max(max, wave[i]);
		}

		return { min: min, max: max, amplitude: max - min };
	}

	getWave() {
		const wavetable = this.props.appState.model.wavetable;
		const offset = this.currentInstrument.waveOffset;
		return wavetable.slice(offset, offset + 256);
	}

	onZeroCross() {
		const w = this.getWave();
		w[0] = 0;
		w[254] = 0;
		w[255] = 0;

		const s = this.createSamplerFromArray(w);
		const s2 = this.convolve(s, zeroCross);

		const extent = 5;
		for (let i = 0; i <= extent; i++) {
			const a = (i / extent);
			w[i] = (1 - a) * s2[i] + a * w[i];

			const j = 254 - i;
			w[j] = (1 - a) * s2[j] + a * w[j];
		}
		w[255] = 0

		this.modifyWave((t, i) => {
			return w[i];
		});
	}

	onFilter(h) {
		const priorLimits = this.getWaveLimits(this.getWave());

		const s = this.createSampler();
		const wave = this.convolve(s, h);

		const newLimits = this.getWaveLimits(wave);
		const scale = priorLimits.amplitude / newLimits.amplitude;

		for (let i = 0; i < wave.length; i++) {
			const n = (wave[i] - newLimits.min) / newLimits.amplitude;
			wave[i] = (n + newLimits.min / newLimits.amplitude) * priorLimits.amplitude;
		}

		this.modifyWave((t, i) => {
			return wave[i];
		});
	}

	onLowPass() {
		this.onFilter(loPass);
	}

	onHighPass() {
		this.onFilter(hiPass);
	}

	onNormalizeWave() {
		const wavetable = this.getWave();

		let min = +Infinity;
		let max = -Infinity;
		for (let i = 0; i < 256; i++) {
			min = Math.min(min, wavetable[i]);
			max = Math.max(max, wavetable[i]);
		}

		const scale = 2 / (Math.abs(max) + Math.abs(min));
		const s = this.createSampler();

		this.modifyWave((t, i) => {
			const n = (s(i) - min) * scale;
			return (n - 1) * 127;
		});
	}

	shiftInstruments(offset, delta) {
		this.props.appState.model.instruments.forEach((instrument, index) => {
			if (instrument.waveOffset >= offset) {
				this.props.actions.updateInstrumentAt(index, 'waveOffset', instrument.waveOffset + delta);
			}
		});
	}

	onLsh = () => {
		const wavetable = this.props.appState.model.wavetable;
		const offset = this.currentInstrument.waveOffset;
		wavetable.splice(offset, 0, ...new Array(64));
		this.props.actions.setWavetable(wavetable.slice(0, wavetable.length - 64));
		this.shiftInstruments(offset, 64);
	}

	onRsh = () => {
		const wavetable = this.props.appState.model.wavetable;
		const offset = this.currentInstrument.waveOffset;
		const moved = wavetable.splice(offset - 64, 64);
		wavetable.splice(wavetable.length, 0, ...moved);
		this.props.actions.setWavetable(wavetable);
		this.shiftInstruments(offset, -64);
	}

	trackMidiChanged = e => {
		this.props.appState.trackMidi = e.target.checked;
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
	setSrcEnd = value => this.setState({ srcEnd: value })

    setDestOffset = value => this.props.actions.updateInstrument(['waveOffset'], value);
	setDestEnd = value => this.setState({ destEnd: value })

    render(props, state) {
		const app = props.appState;
		if (!app.ready) {
			return;
		}

		const model = app.model;
		const actions = props.actions;
		const instrumentNames = app.instrumentNames.map((name, index) => `${index}: ${name}`);
		const waveOffset = this.currentInstrument.waveOffset;

		return (
			<div class={style.home}>
            <input type="file" id="file-input" onchange={this.readSingleFile} />
                <h3>Contents of the file:</h3>
                <pre id="file-content">{ this.state.sample }</pre>
				<WaveEditor 
					waveStyle={ style.waveEditor }
					wave={ state.sample }
					selectionStart={ state.srcOffset }
					selectionEnd={ state.srcEnd }
					xor={ 0 }
					setWave={ actions.setWave }
					setOffset={ this.setSrcOffset }
                    setEnd={ this.setSrcEnd } />
				<button onclick={ this.onCopy }>Copy</button>
				<WaveEditor 
					waveStyle={ style.waveEditor }
					wave={ model.wavetable }
					selectionStart={ waveOffset }
					selectionEnd={ state.destEnd }
					xor={ this.currentInstrument.xor }
					setWave={ actions.setWave }
                    setOffset={ this.setDestOffset }
                    setEnd={ this.setDestEnd } />
				<div>
					<input ref={element => { this.waveFormulaBox = element; }} list="waveFormulaList" onchange={this.onFormulaChanged.bind(this)} class={style.waveFormula} />
					<datalist id="waveFormulaList">
						<option value="rand()"></option>
						<option value="t < 0.5 ? 1 : -1"></option>
						<option value="tan(pi * t)"></option>
						<option value="sin(2 * pi * t)"></option>
						<option value="t < 0.25 ? 4*t : t < 0.75 ? 2-4*t : 4*t - 4"></option>
						<option value="(t < 0.5 ? (2*t): (2*t) - 2)"></option>
						<option value="min(max(s(i), -0.85), 0.85)"></option>
					</datalist>
					<button onclick={this.onSetWave.bind(this)}>Apply</button>
					<button onclick={this.onLowPass.bind(this)}>Low Pass</button>
					<button onclick={this.onHighPass.bind(this)}>High Pass</button>
					<button onclick={this.onZeroCross.bind(this)}>Zero Cross</button>
					<button onclick={this.onNormalizeWave.bind(this)}>Normalize</button>
					<button onclick={this.onRsh} disabled={waveOffset < 64}>Rsh</button>
					<button onclick={this.onLsh}>Lsh</button>
				</div>
				<LerpEditor appState={ app } actions={ actions } programIndex={ this.currentInstrument.ampMod } modType='ampMod' />
				<LerpEditor appState={ app } actions={ actions } programIndex={ this.currentInstrument.freqMod } modType='freqMod' />
				<LerpEditor appState={ app } actions={ actions } programIndex={ this.currentInstrument.waveMod } modType='waveMod' />
				<InstrumentEditor appState={ app } actions={ actions } />
			</div>
		);
	}
}
