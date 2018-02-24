import { h, Component } from 'preact';
import WaveView from '../wave';

export default class WaveEditor extends WaveView {
	constructor() {
		super();
		this.setState({
			waveOffset: 0,
			isDragging: false,
			lastDragLocation: {x: -1, y: -1}
		});
	}

	yToWave(y) {
		const u =  ((y / this.canvas.height) * 0xFF) & 0xFF;
		return u < 127
			? 127 - u
			: -u + 127;
	}

	pointerToWave(ev) {
		const x = Math.min(Math.max(ev.offsetX, 0), this.state.canvasWidth);
		const y = Math.min(Math.max(ev.offsetY, 0), this.state.canvasHeight);

		const p = {
			x: x,
			y: this.yToWave(y)
		};

		console.log(`${JSON.stringify(p)}`);
		return p;
	}

	onPointerDown(e) {
		super.onPointerDown(e);
		const p = this.pointerToWave(e);
		const dx = p.x - this.props.instrument.waveOffset;

		this.canvas.setPointerCapture(e.pointerId);
		this.setState({
			isDragging: true,
			dx: dx,
			lastDragLocation: p
		});
	}

	onPointerUp(e) {
		super.onPointerUp(e);
		this.canvas.releasePointerCapture(e.pointerId);
		this.setState({
			isDragging: false,
			dx: -1,
			lastDragLocation: { x: -1, y: -1 }
		});
	}

	line(x0, y0, x1, y1, xMin, xMax) {
		this.props.actions.updateModel(['wavetable'], old => {
			return old.withMutations(wavetable => {
				const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
				const dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; 
				let err = (dx > dy ? dx : -dy) / 2;
				 
				while (x0 < xMax) {
					if (x0 >= xMin) {
						wavetable.set(x0, y0);
					}
					if (x0 === x1 && y0 === y1) {
						break;
					}
					
					const e2 = err;
					if (e2 > -dx) {
						err -= dy;
						x0 += sx;
					}
					if (e2 < dy) {
						err += dx;
						y0 += sy;
					}
				}
			});
		});
	}

	onPointerMove(ev) {
		super.onPointerMove(ev);

		if (!this.state.isDragging) {
			return;
		}

		const p = this.pointerToWave(ev);
		const newValue = p.x - this.state.dx;

		if (this.props.isEditing) {
			const offset = this.props.instrument.waveOffset;
			this.line(
				this.state.lastDragLocation.x,
				this.state.lastDragLocation.y,
				p.x,
				p.y,
				offset,
				offset + 256);
		} else {
			this.props.actions.updateInstrument(['waveOffset'], value =>
				Math.min(Math.max(newValue, 0), this.props.wavetable.size - 256));
		}

		this.setState({
			lastDragLocation: p
		});
	}

	sample(index) {
		// const xor = this.props.instrument.xor;
		// const s = this.props.wavetable.get(index);
        // return this.toInt8((s & 0xFF) ^ xor);
        return -1;
    }
}