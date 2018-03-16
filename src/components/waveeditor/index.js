import WaveEditorCanvas from '../../components/waveeditorcanvas';
import { h, Component } from 'preact';
import style from './style';

export default class Home extends Component {
	state = {
        waveOffset: 0,
        scrollX: 0,
        isEditing: false,
    }
    
    constructor () {
        super();

        const rafLoop = () => {
            const scrollX = this.scrollBar
                ? Math.round(this.scrollBar.scrollLeft)
                : 0;

            if (scrollX != this.state.scrollX) {
                this.setState({ scrollX })
            }

            requestAnimationFrame(rafLoop);
        };

        requestAnimationFrame(rafLoop);
    }

	editModeChanged = e => {
		this.setState({ isEditing: e.target.checked })
	}

	onMoveWave = (delta) => {
		const original = this.props.waveOffset;
		const limit = this.props.wave.length - 256;
		let updated = Math.round(original / Math.abs(delta)) * Math.abs(delta);
		updated = Math.min(Math.max(0, updated + delta), limit)
	
		this.props.setOffset(updated);
	}

    setScrollbar = element => this.scrollBar = element;

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
                        setOffset={ props.setOffset }
                        scrollX={ state.scrollX } />
                </div>
                <div ref={ this.setScrollbar } style='overflow-x: scroll; overflow-y: hidden'>
					<div class={style.scrollBar} style={`width: ${props.wave.length}px; height: 0px`} />
                </div>
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
