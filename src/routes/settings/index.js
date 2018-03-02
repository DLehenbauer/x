import { h, Component } from 'preact';
import style from './style';

export default class Settings extends Component {
	resetClicked = () => {
		localStorage.removeItem('model');
		location.reload();
	}

	render() {
		return (
			<div class={style.profile}>
				<button onclick={this.resetClicked}>Reset</button>
			</div>
		);
	}
}
