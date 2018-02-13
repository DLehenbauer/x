import { h, Component } from 'preact';
import Canvas from '../canvas';

export default class WaveView extends Canvas {
	toInt8 = (value) => {
		value &= 0xFF;
		return value > 127
			? value - 256
			: value;
	};

	sample(index) {	}

    drawGrid(draw, xDiv, yDiv) {
		const width = this.state.canvasWidth;
		const height = this.state.canvasHeight;

        draw.strokeStyle = 'black';
        draw.lineWidth = 1;
        const hw = draw.lineWidth / 2;
        
        draw.setLineDash([3, 3]);
        draw.strokeStyle = this.state.gridColor;
        draw.beginPath();

        for (let a = 0; a < yDiv; a++) {
            const y = Math.round(height * (a / yDiv)) - hw;
            draw.moveTo(0, y);
            draw.lineTo(width, y);
        }

        for (let a = 0; a < xDiv; a++) {
            const x = Math.round(width * (a / xDiv)) - hw;
            draw.moveTo(x, 0);
            draw.lineTo(x, height);
        }
        draw.stroke();
        draw.setLineDash([]);
    }

	waveToHomogenous(s) {
		return (255 - (s + 128)) / 255;
	}

	paint(draw) {
        const state = this.state;
		const width = state.canvasWidth;
		const height = state.canvasHeight;

		draw.clearRect(0, 0, width, height);
        this.drawGrid(draw, 10, 10);
        
        draw.beginPath();
        draw.strokeStyle = 'red';
        draw.rect(0, 0, width, height);
        draw.stroke();

		draw.strokeStyle = state.strokeStyle;
        draw.lineWidth = this.state.lineWidth;
        const hw = draw.lineWidth / 2;
        draw.beginPath();

        const sx = Math.floor(height - this.state.lineWidth);
        const s = this.waveToHomogenous(this.sample(0)) * sx
        draw.moveTo(0, s + hw);

        for (let index = 0; index < width; index++) {
			const s = this.waveToHomogenous(this.sample(index)) * sx;
           	draw.lineTo(index, s + hw);
        }

        draw.stroke();
    }
    
    componentDidMount() {
        super.componentDidMount();

        const strokeStyle = this.state.strokeStyle || window.getComputedStyle(this.canvas).color;
        const lineWidth = this.state.lineWidth || parseInt(window.getComputedStyle(this.canvas).strokeWidth);
        const gridColor = this.state.gridColor || window.getComputedStyle(this.canvas).borderColor;

        this.setState({ gridColor, strokeStyle, lineWidth });
    }
}