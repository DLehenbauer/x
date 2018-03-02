import { h, Component } from 'preact';
import { Link } from 'preact-router/match';
import style from './style';

export default class Header extends Component {
	resetClicked = () => {
		localStorage.removeItem('model');
		location.reload();
	}

	render() {
		return (
			<header class={style.header}>
				<h1>Synth</h1>
				<nav>
					<span class={style.icon} onclick={this.resetClicked}>&#x21bb;</span>
					<Link activeClassName={style.active} href="/">Home</Link>
					<Link activeClassName={style.active} href="/settings"><div class={style.icon}>&#x2699;</div></Link>
				</nav>
			</header>
		);
	}
}
