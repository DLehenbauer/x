import { h, Component } from 'preact';
import style from './style';

export default class Canvas extends Component {
    isPaintPending = false;
    isSizeInvalid = true;

	onPointerDown(e)    { e.preventDefault(); }
	onPointerUp(e)      { e.preventDefault(); }
	onPointerMove(e)    { e.preventDefault(); }

	render(props, state) {
		return (
            <canvas ref={element => { this.canvas = element; }}
                class={style.canvas}
                width={state.canvasWidth}
                height={state.canvasHeight}
                onpointerdown={this.onPointerDown.bind(this)}
                onpointerup={this.onPointerUp.bind(this)}
                onpointermove={this.onPointerMove.bind(this)}>
            </canvas>
		);
	}

    rafHandler = () => {
        this.isPaintPending = false;

        if (this.isSizeInvalid) {
            this.isSizeInvalid = false;
            const canvas = this.canvas;
            const canvasWidth = canvas.offsetWidth;
            const canvasHeight = canvas.offsetHeight;
            if (canvasWidth !== this.state.canvasWidth || canvasHeight !== this.state.canvasHeight) {
                canvas.width  = canvasWidth;
                canvas.height = canvasHeight;            
                this.setState({ canvasWidth, canvasHeight });
            }
        }

        this.paint(this.canvas.getContext('2d'));
    };

    invalidate() {
        if (this.isPaintPending) {
            return;
        }

        requestAnimationFrame(this.rafHandler);
    }

    paint(draw) {
        // Subclasses draw here
    }

    onResize = () => {
        this.isSizeInvalid = true;
        this.invalidate();
    }

    componentDidMount() {
        window.addEventListener('resize', this.onResize);
		this.onResize();
	}

	componentDidUpdate() {
        this.invalidate();
	}
}