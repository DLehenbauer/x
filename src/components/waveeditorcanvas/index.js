import { h, Component } from 'preact';
import WaveCanvas from '../wavecanvas';

export default class WaveEditorCanvas extends WaveCanvas {
	constructor() {
		super();
		this.setState({
			isDragging: false,
			isPrimary: true,
			lastDragLocation: {x: -1, y: -1}
		});
	}

	get selectionSize() {
		return this.props.selectionEnd - this.props.selectionStart;
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
			x: x + this.props.scrollX,
			y: this.yToWave(y)
		};

		//console.log(`${JSON.stringify(p)}`);
		return p;
	}

	onPointerDown(e) {
		super.onPointerDown(e);
		this.canvas.setPointerCapture(e.pointerId);

		const p = this.pointerToWave(e);
		const editStart = !e.shiftKey;

		const start = this.props.selectionStart;
		const end = this.props.selectionEnd;
		const dx = p.x - (editStart ? start : end);
		const value = p.x - dx;
		const isInside = end <= value && value <= start;

		this.setState({
			isDragging: true,
			isPrimary: editStart,
			dx: isInside || !editStart ? dx : this.selectionSize / 2,
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
		const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
		const dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1; 
		let err = (dx > dy ? dx : -dy) / 2;
		 
		while (x0 < xMax) {
			if (x0 >= xMin) {
				this.props.setWave(x0, y0);
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
	}

	onPointerMove(ev) {
		super.onPointerMove(ev);

		if (!this.state.isDragging) {
			return;
		}

		const p = this.pointerToWave(ev);

		if (this.props.isEditing) {
			this.line(
				this.state.lastDragLocation.x,
				this.state.lastDragLocation.y,
				p.x,
				p.y,
				this.props.selectionStart,
				this.props.selectionEnd);
		} else {
			const value = p.x - this.state.dx;
			const clamped = Math.min(Math.max(value, 0), this.props.wave.length - 256);
			if (this.state.isPrimary) {
				this.props.setOffset(clamped);
			} else {
				const size = Math.max(clamped - this.props.selectionStart, 1);
				this.props.setSelectionSize(size);
			}
		}

		this.setState({
			lastDragLocation: p
		});
	}

	paint(context2d, width, height) {
		const state = this.state;
		const scrollX = this.props.scrollX;

		context2d.clearRect(0, 0, width, height);
		this.drawGrid(context2d, 10, 10);
		
		context2d.fillStyle = this.props.isEditing
			? "rgba(255, 128, 64, 0.4)"
			: "rgba(64, 128, 255, 0.4)";
		const selectionWidth = this.props.selectionEnd - this.props.selectionStart;
		context2d.fillRect(this.props.selectionStart - scrollX, 0, selectionWidth, height);

        this.drawWave(context2d, width, height, scrollX);
    }

	sample(index) {
		const xor = this.props.xor;
		const s = this.props.wave[index];
        return this.toInt8((s & 0xFF) ^ xor);
    }
}