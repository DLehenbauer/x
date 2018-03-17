import WaveEditorCanvas from '../../components/waveeditorcanvas';
import { h, Component } from 'preact';
import style from './style';

export default class Home extends Component {
	state = {
        selectionStart: 0,
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
		const original = this.props.selectionStart;
		const limit = this.props.wave.length - 256;
		let updated = Math.round(original / Math.abs(delta)) * Math.abs(delta);
		updated = Math.min(Math.max(0, updated + delta), limit)
    
        this.scrollBar.scrollLeft += delta;

        const size = this.props.selectionEnd- this.props.selectionStart;
		this.props.setOffset(updated);
        this.props.setEnd(updated + size);
	}

    setScrollbar = element => this.scrollBar = element;

    selectionSizeChanged = e => {
        const size = parseInt(e.target.value);
        this.props.setEnd(this.props.selectionStart + size);
    }

	render(props, state) {
		return (
            <div>
                <div class={props.waveStyle}>
                    <WaveEditorCanvas
                        isEditing={ state.isEditing }
                        wave={ props.wave }
                        selectionStart={ props.selectionStart }
                        selectionEnd={ props.selectionEnd }
                        xor={ props.xor }
                        setWave={ props.setWave }
                        setOffset={ props.setOffset }
                        setEnd={ props.setEnd }
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
                <input type='number' value={ props.selectionEnd - props.selectionStart } min='0' max='999' onchange={ this.selectionSizeChanged } />
            </div>
		);
	}
}
