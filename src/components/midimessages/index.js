import { h, Component } from 'preact';
import style from './style';

export default class MidiMessages extends Component {
	constructor() {
		super();
	}

    /** Return the given number as an 8-bit/2-digit hexadecimal string. */
    hex8(value) {
        const hex = (value & 0xFF).toString(16);
        return "00".substr(hex.length) + hex;
    }

	render(props, state) {
		const rows = this.props.messages.map(message => {
			const hex = Array.prototype.map.call(message.data, value => this.hex8(value));
			const data = hex.join(" ");

			return (<tr>
				<td>{Math.round(message.timeStamp).toString()}</td><td>{data}</td>
			</tr>);
		});

		return (
			<div class={style.container} ref={element => { this.container = element; }}>
				<table class={style.table}>
					<tr><td>Timestamp</td><td>Data</td></tr>
					{rows}
				</table>
			</div>
		);
	}

	componentDidUpdate() {
		this.container.scrollTop = this.container.scrollHeight;
	}
}