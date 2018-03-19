import { h, Component } from 'preact';
import Canvas from '../canvas';

import Firmware from '../../firmware/firmware-client';

export default class LerpCanvas extends Canvas {
    constructor() {
        super();
        this.firmware = new Firmware();
    }

	paint(context2d, width, height) {
        const props = this.props;

        this.firmware.connected.then(() => {
            this.firmware.sync(props.appState.model);
        }).then(() => {
            return this.firmware.plotLerp(props.program, width).then(plot => {
                const state = this.state;

                context2d.clearRect(0, 0, width, height);
        
                context2d.beginPath();
                context2d.strokeStyle = state.strokeStyle;
                context2d.lineWidth = state.lineWidth;
        
                const sy = 1/127 * height;
                context2d.moveTo(0, height);
        
                for (let x = 0; x < plot.length; x++) {
                    const y = plot[x];
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