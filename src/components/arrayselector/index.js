import { h, Component } from 'preact';
import style from './style';

export default class ArraySelector extends Component {
	previousClicked = () => {
		this.props.onselect(this.props.selectedIndex - 1);
	}

	nextClicked = () => {
		this.props.onselect(this.props.selectedIndex + 1);
	}

	selectionChanged = e => {
		const index = parseInt(e.target.selectedOptions[0].value);
		this.props.onselect(index);
	}

	render(props, state) {
        const selectedIndex = props.selectedIndex;
        const maxSelection = props.options.length - 1;
        
        const options = props.options.map((name, index) => {
			const selected = index === selectedIndex;
			return (
				<option value={index} selected={selected}>{name}</option>	
			);
		});

		return (
			<span>
				<button class={style.selectorButton} onclick={this.previousClicked} disabled={selectedIndex <= 0}>&#x25c0;</button>
				<select onchange={this.selectionChanged}>{options}</select>
				<button class={style.selectorButton} onclick={this.nextClicked} disabled={selectedIndex >= maxSelection}>&#x25ba;</button>
			</span>
		);
	}
}
