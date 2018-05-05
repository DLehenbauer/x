import { h, Component } from 'preact';
import Canvas from '../canvas';

import Firmware from '../../firmware/firmware-client';

export default class EnvelopeCanvas extends Canvas {
    constructor() {
        super();
        this.firmware = new Firmware();
    }

	paint(context2d, width, height) {
        const props = this.props;

        this.firmware.connected.then(() => {
            this.firmware.storeAll(props.appState.model.persistant.synth);
        }).then(() => {
            return this.firmware.plotEnvelope(props.program, width).then(plot => {
                const state = this.state;

                context2d.clearRect(0, 0, width, height);
        
                const sy = 1/127 * height;

                const boundaries = plot.stageBoundaries;
                let x0 = 0;
                for (let i = 0; i < boundaries.length; i++) {
                    const alpha = 0.3 - ((i / boundaries.length) / 4);
                    context2d.fillStyle = `rgba(0, 64, 255, ${alpha})`;
                    const x1 = boundaries[i];
                    context2d.fillRect(x0, 0, x1 - x0, height);
                    x0 = x1;
                }

                context2d.beginPath();
                context2d.strokeStyle = state.strokeStyle;
                context2d.lineWidth = state.lineWidth;
                context2d.moveTo(0, height);
        
                const values = plot.values;
                for (let x = 0; x < values.length; x++) {
                    const y = values[x];
                    context2d.lineTo(x, height - y * sy);
                }
        
                context2d.stroke();

                // Draw outline to test CSS layout
                // context2d.beginPath();
                // context2d.strokeStyle = 'red';
                // context2d.rect(0, 0, width, height);
                // context2d.stroke();
            });
        });
    }
    
    componentDidMount() {
        super.componentDidMount();

        const strokeStyle = this.state.strokeStyle || window.getComputedStyle(this.canvas).color;
        const lineWidth = this.state.lineWidth || parseInt(window.getComputedStyle(this.canvas).strokeWidth);
        const gridColor = this.state.gridColor || window.getComputedStyle(this.canvas).borderColor;

        this.setState({ gridColor, strokeStyle, lineWidth });
    }
}