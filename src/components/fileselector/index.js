import { h, Component } from 'preact';
import style from './style';

export default class FileSelector extends Component {
    onSelected = e => {
        const file = e.target.files[0];
        if (!file) {
            return;
		}
		
        const reader = new FileReader();
        reader.onload = e => {
            this.props.setFile(e.target.result);
        };
        reader.readAsArrayBuffer(file);
    }

	render(props, state) {
		return (
			<span>
            	<input type="file" id="file-input" onchange={this.onSelected} />
			</span>
		);
	}
}