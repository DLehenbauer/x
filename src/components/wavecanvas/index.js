import { h, Component } from 'preact';
import Canvas from '../canvas';

export default class WaveCanvas extends Canvas {
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

    drawWave(context2d, width, height, startX) {
        const state = this.state;
		context2d.strokeStyle = state.strokeStyle;
        context2d.lineWidth = this.state.lineWidth;
        const hw = context2d.lineWidth / 2;
        context2d.beginPath();

        const sx = Math.floor(height - this.state.lineWidth);
        const s = this.waveToHomogenous(this.sample(0 + startX)) * sx
        context2d.moveTo(0, s + hw);

        for (let index = 0; index < width; index++) {
			const s = this.waveToHomogenous(this.sample(index + startX)) * sx;
           	context2d.lineTo(index, s + hw);
        }

        context2d.stroke();
    }

	paint(context2d, width, height) {
        const state = this.state;

		context2d.clearRect(0, 0, width, height);
        this.drawGrid(context2d, 10, 10);
        this.drawWave(context2d, width, height, /* startX: */ 0);

        // Draw outline to test CSS layout
        // draw.beginPath();
        // draw.strokeStyle = 'red';
        // draw.rect(0, 0, width, height);
        // draw.stroke();
    }
    
    componentDidMount() {
        super.componentDidMount();

        const strokeStyle = this.state.strokeStyle || window.getComputedStyle(this.canvas).color;
        const lineWidth = this.state.lineWidth || parseInt(window.getComputedStyle(this.canvas).strokeWidth);
        const gridColor = this.state.gridColor || window.getComputedStyle(this.canvas).borderColor;

        this.setState({ gridColor, strokeStyle, lineWidth });
    }
}