import WaveEditorCanvas from '../../components/waveeditorcanvas';
import { h, Component } from 'preact';
import style from './style';

export default class Home extends Component {
	state = {
        waveOffset: 0,
        scrollX: 0,
		isEditing: false
    }
    
    constructor () {
        super();

        window.setInterval(() => {
            const scrollX = this.scrollBar
                ? this.scrollBar.scrollLeft
                : 0;

            if (scrollX != this.state.scrollX) {
                this.setState({ scrollX })
                alert(scrollX)
            }
        }, 16);
    }

	editModeChanged = e => {
		this.setState({ isEditing: e.target.checked })
	}

	onMoveWave = (delta) => {
		const model = this.props.appState.model;
		const original = this.currentInstrument.waveOffset;
		const limit = model.wavetable.length - 256;
		let updated = Math.round(original / Math.abs(delta)) * Math.abs(delta);
		updated = Math.min(Math.max(0, updated + delta), limit)
	
		this.props.actions.updateInstrument(['waveOffset'], updated);
	}

	render(props, state) {
		return (
            <div>
                <div class={props.waveStyle}>
                    <WaveEditorCanvas
                        isEditing={ state.isEditing }
                        wave={ props.wave }
                        waveOffset={ props.waveOffset }
                        xor={ props.xor }
                        setWave={ props.setWave }
                        setOffset={ props.setOffset } />
                </div>
                <div style='overflow-x: scroll; overflow-y: hidden'>
					<div ref={element => { this.scrollBar = element; }} class={style.scrollBar} style={`width: ${props.wave.length}px; height: 0px`} />
                </div>
                <input type='range' min='0' max={ props.wave.length - parseInt(props.waveStyle.width) } value={ state.scrollX } onchange={ () => {} } />
                <input type='checkbox' onchange={this.editModeChanged}></input><label>Edit</label>
                <button onclick={() => this.onMoveWave(-(1 << 30))}>|&lt;</button>
                <button onclick={() => this.onMoveWave(-256)}>&lt;&lt;</button>
                <button onclick={() => this.onMoveWave(-64)}>&lt;</button>
                <button onclick={() => this.onMoveWave(+64)}>&gt;</button>
                <button onclick={() => this.onMoveWave(+256)}>&gt;&gt;</button>
                <button onclick={() => this.onMoveWave(+(1 << 30))}>&gt;|</button>
            </div>
		);
	}
}
