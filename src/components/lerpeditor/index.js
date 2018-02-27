import { h, Component } from 'preact';
import style from './style';

export default class LerpEditor extends Component {
    lerpChanged = e => {
        const target = e.target;
        const path = `${target.name}`
        this.props.actions.setLerpStage(path, parseInt(target.value));
    };

	render(props, state) {
        let rows = props.stages.map((stage, index) => {
            return (
                <div class={style.stage}>
                    <span>{ index }: </span>
                    <input name={ `[${index}].slope` }   type='number' min='-32768' max='32767' value={ stage.slope }   onchange={ this.lerpChanged } />
                    <input name={ `[${index}].limit` }   type='number' min='-128' max='127' value={ stage.limit }   onchange={ this.lerpChanged } />
                </div>
            );
        });

		return (
            <div>
                { rows }
            </div>
		);
	}
}