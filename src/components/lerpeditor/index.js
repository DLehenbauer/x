import { h, Component } from 'preact';
import style from './style';

const toDegrees = 180 / Math.PI;
const toRadians = Math.PI / 180;

export default class LerpEditor extends Component {
    getStartValue(stageIndex) {
        // HACK:
        return stageIndex > 2
            ? this.props.stages[stageIndex - 1].limit
            : 0;
    }

    getEndValue(stageIndex) {
        return this.props.stages[stageIndex].limit;
    }

    sliderToSlopeAngle(stageIndex, angle) {
        const start = this.getStartValue(stageIndex);
        const end = this.getEndValue(stageIndex);

        return (start < end
            ? 90 - angle
            : angle - 90);
    }

    sliderToSlope(stageIndex, value) {
        const start = this.getStartValue(stageIndex);
        const end = this.getEndValue(stageIndex);

        const angle = start < end
            ? 90 - value
            : value - 90;
        
        return Math.tan(angle * toRadians) * 256;
    }

    slopeToSlider(stageIndex, slope) {
        const angle =  Math.atan(slope / 256) * toDegrees;

        const start = this.getStartValue(stageIndex);
        const end = this.getEndValue(stageIndex);

        return start < end
            ? 90 - angle
            : 90 + angle;
    }

    slopeChanged = e => {
        const target = e.target;
        const stageIndex = parseInt(target.name);
        const path = `[${target.name}].slope`;
        const value = parseInt(target.value);
        this.props.actions.setLerpStage(path, this.sliderToSlope(stageIndex, value));
    };

    lerpChanged = e => {
        const target = e.target;
        const path = `${target.name}`
        this.props.actions.setLerpStage(path, parseInt(target.value));
    };

	render(props, state) {
        let rows = props.stages.map((stageIndex, index) => {
            const angle = this.slopeToSlider(index, stageIndex.slope);
            return (
                <div class={style.stage}>
                    <span>{ index }: </span>
                    <input name={ index } type='range' min='0' max='89' value={ angle } onchange={ this.slopeChanged } />
                    <input name={ `[${index}].limit` }   type='number' min='-128' max='127' value={ stageIndex.limit } onchange={ this.lerpChanged } />
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