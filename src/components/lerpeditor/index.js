import { h, Component } from 'preact';
import style from './style';
import ArraySelector from '../arrayselector';

const toDegrees = 180 / Math.PI;
const toRadians = Math.PI / 180;

export default class LerpEditor extends Component {
    getStartValue(stageIndex) {
        const app = this.props.appState;
        const model = app.model;
        
        return stageIndex > 2
            ? model.lerpStages[stageIndex - 1].limit
            : 0;
    }

    getEndValue(stageIndex) {
        const app = this.props.appState;
        const model = app.model;
        
        return model.lerpStages[stageIndex].limit;
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

	get currentInstrument() {
		const model = this.props.appState.model;
		return model.channelToInstrument[model.currentChannel];
	}

    programSelected = index => {
        this.props.actions.updateInstrument('ampMod', index);
    };

	render(props, state) {
        const app = this.props.appState;
        if (!app.ready) {
            return;
        }

        const model = app.model;
        const programIndex = model.instruments[this.currentInstrument].ampMod;

        const programNames = model.lerpPrograms.map((lerp, index) => index);

        const program = model.lerpPrograms[programIndex];
        const rows = [];

        for (let progressionIndex = program.start, stageIndex = model.lerpProgressions[progressionIndex];
            stageIndex != 0;
            stageIndex = model.lerpProgressions[++progressionIndex]) {

            const stage = model.lerpStages[stageIndex];
            const angle = this.slopeToSlider(stageIndex, stage.slope);
            rows.push(
                <div class={style.stage}>
                    <span>{ stageIndex }:</span>
                    <input name={ stageIndex } type='range' min='0' max='89' value={ angle } onchange={ this.slopeChanged } />
                    <input name={ `[${stageIndex}].limit` } type='number' min='-128' max='127' value={ stage.limit } onchange={ this.lerpChanged } />
                </div>
            );
        }
		return (
            <div>
                <ArraySelector onselect={this.programSelected} selectedIndex={programIndex} options={programNames} />
                { rows }
            </div>
		);
	}
}