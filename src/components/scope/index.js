import { h, Component } from 'preact';
import style from './style';
import Wave from '../wave';

export default class Scope extends Wave {
    sample(index) {
        return this.waveData[index] - 128;
    }

    updateLoop = () => {
        this.analyser.getByteTimeDomainData(this.waveData);
        this.invalidate();
        requestAnimationFrame(this.updateLoop);
    };

    componentDidUpdate() {
        super.componentDidUpdate();
        if (this.props.source) {
            this.props.source.connect(this.analyser);
        }
    }

    componentDidMount() {
        super.componentDidMount();
        this.analyser = this.props.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.waveData = new Uint8Array(this.analyser.frequencyBinCount);
        this.componentDidUpdate();
        requestAnimationFrame(this.updateLoop);
    }
}