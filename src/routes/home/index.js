import Scope from '../../components/scope';
import WaveEditor from '../../components/waveeditor';
import LerpEditor from '../../components/lerpeditor';
import InstrumentEditor from '../../components/instrumenteditor';
import ArraySelector from '../../components/arrayselector';
import { h, Component } from 'preact';
import style from './style';
import Midi from '../../common/midi';

// High pass FIR at ~7760hz
const hiPass = [-0.075579, 0.800000, -0.075579];

// Low pass FIR at ~7760hz
const loPass = [0.187098, 0.800000, 0.187098];

// Gaussian Low-Pass for smoothing wave edges for zero-crossing
const zeroCross = [0.028532, 0.067234, 0.124009, 0.179044, 0.20236, 0.179044, 0.124009, 0.067234, 0.028532];

const channels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

export default class Home extends Component {
	state = {
		selectionSize: 256,
		clipboard: []
	}

	startClicked = () => {
		this.props.actions.noteOn();
	}

	stopClicked = () => {
		this.props.actions.noteOff();
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

	get selectionStart() { return this.currentInstrument.waveOffset; }
	get selectionEnd() { return this.selectionStart + this.state.selectionSize; }

	instrumentSelected = index => {
		this.props.actions.selectInstrument(index);
		this.state.selectionSize = 256;
	}

	channelSelected = index => {
		this.props.actions.selectChannel(index);
	}

	onFormulaError(error) {
		this.waveFormula = (t, i, s, a0, a1) => s(i);
		this.waveFormulaBox.setCustomValidity(error);
	}

	onFormulaChanged(e) {
		try {
			this.waveFormula = eval(`(t, i, s, a0, a1) => { 'use strict'; const max = Math.max; const min = Math.min; const pi = Math.PI; const sin = Math.sin; const tan = Math.tan; const rand = () => Math.random() * 2 - 1; return (${e.target.value}) * 127; }`);
		} catch (error) {
			this.onFormulaError(error);
		}
	}

	createSampler() {
		return this.createSamplerFromArray(this.getWave());
	}

	createSamplerFromArray(wave) {
		return (index) => {
			return wave[(index >>> 0) % wave.length];
		};
	}

	modifyWave(fn) {
		const offset = this.currentInstrument.waveOffset;
		const s = this.createSampler();
		const size = this.state.selectionSize;
		const last = size - 1;

		this.props.actions.updateWavetable(
			this.selectionStart, this.selectionEnd,
			wave => {
				const step = 1 / last;
				let t = 0;
				for (let i = 0; i < size; i++) {
					const a1 = i / last;
					const a0 = 1 - a1;
					const sample = fn(a1, i, i => s(i) / 127, a0, a1);
					wave[i] = Math.max(Math.min(Math.round(sample), 127), -127) | 0;
				}
			});
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
		const size = this.state.selectionSize;
		const y = new Array(size);
		const m = Math.floor(h.length / 2);
		for (let i = 0; i < size; i++) {
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
		return wavetable.slice(this.selectionStart, this.selectionEnd);
	}

	deglitch(wave, includeLeft) {
		const last = wave.length - 1;
		const s = this.createSamplerFromArray(wave);
		const s2 = this.convolve(s, zeroCross);

		const extent = 5;
		for (let i = 0; i <= extent; i++) {
			const a = (i / extent);
			if (includeLeft) {
				wave[i] = (1 - a) * s2[i] + a * wave[i];
			}

			const j = last - i;
			wave[j] = (1 - a) * s2[j] + a * wave[j];
		}

		this.modifyWave((t, i) => {
			return wave[i];
		});
	}

	onDeglitch = () => {
		this.deglitch(this.getWave(), false);
	}

	onZeroCross() {
		const wave = this.getWave();
		const last = wave.length - 1;
		wave[0] = 0;
		wave[last] = 0;

		this.deglitch(wave, true);
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
		const wave = this.getWave();

		let min = +Infinity;
		let max = -Infinity;
		for (let i = 0; i < wave.length; i++) {
			min = Math.min(min, wave[i]);
			max = Math.max(max, wave[i]);
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
		wavetable.splice(offset, 0, ...new Array(64).fill(0));
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

	onCopy = () => {
		const wavetable = this.props.appState.model.wavetable;
		this.setState({
			clipboard: this.props.appState.model.wavetable.slice(
				this.selectionStart, this.selectionEnd
			)
		});
	}

	onPaste = () => {
		const wave = this.state.clipboard;
		const offset = this.selectionStart;

		const wavetable = this.props.appState.model.wavetable;
		wavetable.splice(wavetable.length - wave.length, wave.length);
		wavetable.splice(offset, 0, ...wave);
		this.props.actions.setWavetable(wavetable);
		this.shiftInstruments(offset, wave.length);
	}

	trackMidiChanged = e => {
		this.props.appState.trackMidi = e.target.checked;
	}

	setWaveOffset = value => {
		this.props.actions.updateInstrument(['waveOffset'], value);
	}

	setSelectionSize = value => {
		this.setState({ selectionSize: value })
	}

	render(props, state) {
		const app = props.appState;
		if (!app.ready) {
			return;
		}

		const model = app.model;
		const actions = props.actions;
		const instrumentNames = Midi.instrumentNames.map((name, index) => `${index}: ${name}`);
		const waveOffset = this.currentInstrument.waveOffset;

		return (
			<div class={style.home}>
				<ArraySelector onselect={this.channelSelected} selectedIndex={this.currentChannel} options={channels} />
				<ArraySelector onselect={this.instrumentSelected} selectedIndex={this.currentInstrumentIndex} options={instrumentNames} />
				<input type='checkbox' checked={ state.trackMidi } onchange={ this.trackMidiChanged } />Track Midi
				<button onclick={this.startClicked}>Start</button>
				<button onclick={this.stopClicked}>Stop</button>
				<div>
					Scope:
					<div class={style.scope}>
						<Scope audioContext={ app.audioContext } source={ app.audioOutputX } />
					</div>
				</div>
				<div>
					Wavetable:
					<WaveEditor 
						waveStyle={ style.waveEditor }
						wave={ model.wavetable }
						selectionStart={ waveOffset }
						selectionSize={ state.selectionSize }
						xor={ this.currentInstrument.xor }
						setWave={ actions.setWave }
						setOffset={ this.setWaveOffset }
						setSelectionSize={ this.setSelectionSize } />
				</div>
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
					<button onclick={ this.onDeglitch }>Deglitch</button>
					<button onclick={this.onNormalizeWave.bind(this)}>Normalize</button>
					<button onclick={this.onRsh} disabled={waveOffset < 64}>Rsh</button>
					<button onclick={this.onLsh}>Lsh</button>
					<button onclick={this.onCopy}>Copy</button>
					<button onclick={this.onPaste}>Paste</button>
				</div>
				<LerpEditor appState={ app } actions={ actions } programIndex={ this.currentInstrument.ampMod } modType='ampMod' />
				<LerpEditor appState={ app } actions={ actions } programIndex={ this.currentInstrument.freqMod } modType='freqMod' />
				<LerpEditor appState={ app } actions={ actions } programIndex={ this.currentInstrument.waveMod } modType='waveMod' />
				<InstrumentEditor appState={ app } actions={ actions } />
			</div>
		);
	}
}
