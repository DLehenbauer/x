import { h, Component } from 'preact';
import style from './style';
import ArraySelector from '../arrayselector';
import Lerp from '../lerp';

const toDegrees = 180 / Math.PI;
const toRadians = Math.PI / 180;

export default class LerpEditor extends Component {
    getStartValue(stageIndex) {
        const app = this.props.appState;
        const model = app.model;

        const program = model.lerpPrograms[this.props.programIndex];
        
        return stageIndex !== program.start
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
        const slope = Math.min(Math.max(Math.round(this.sliderToSlope(stageIndex, value)), -32768), 32767);
        this.props.actions.setLerpStage(path, slope);
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
        this.props.actions.updateInstrument(this.props.modType, index);
    };

    adjustPrograms(programs, index, delta) {
        for (let i = 0; i < programs.length; i++) {
            const program = programs[i];
            if (program.start >= index) {
                program.start += delta;
            }
        }
    }

    get currentProgram() {
        const props = this.props;
        return props.appState.model.lerpPrograms[props.programIndex];
    }

    addStage = e => {
        const stageIndex = parseInt(e.target.name);
        const model = this.props.appState.model;

        const programs = model.lerpPrograms.slice(0);
        this.adjustPrograms(
            programs,
            stageIndex === this.currentProgram.start
                ? stageIndex + 1
                : stageIndex,
            1);

        const stages = model.lerpStages.slice(0, model.lerpStages.length - 2);
        stages.splice(stageIndex, 0, { slope: 0, limit: 0 });

        this.props.actions.setLerps(stages, programs);
    }

    removeStage = e => {
        const stageIndex = parseInt(e.target.name);
        const model = this.props.appState.model;

        const programs = model.lerpPrograms.slice(0);
        this.adjustPrograms(
            programs,
            stageIndex === this.currentProgram.start
                ? stageIndex + 1
                : stageIndex,
            -1);

        const stages = model.lerpStages.concat({ start: 0, loopStart: 1, loopEnd: 0 });
        stages.splice(stageIndex, 1);

        this.props.actions.setLerps(stages, programs);
    }

    loopChanged = e => {
        const model = this.props.appState.model;
        const programs = model.lerpPrograms.slice(0);
        programs[this.props.programIndex][e.target.name] = e.target.value;
        this.props.actions.setLerps(model.lerpStages, programs);
    }

	render(props, state) {
        const app = this.props.appState;
        if (!app.ready) {
            return;
        }

        const model = app.model;
        const programIndex = Math.min(props.programIndex, model.lerpPrograms.length - 1);
        const programNames = model.lerpPrograms.map((lerp, index) => index);

        const program = model.lerpPrograms[programIndex];
        const rows = [];

        for (let stageIndex = program.start, stage = model.lerpStages[stageIndex]; stageIndex.slope !== 0 && stage.limit !== -64; stage = model.lerpStages[++stageIndex]) {
            const angle = this.slopeToSlider(stageIndex, stage.slope);
            rows.push(
                <div class={style.stage}>
                    <span>{ stageIndex }:</span>
                    <input name={ stageIndex } type='range' min='0' max='89' value={ angle } onchange={ this.slopeChanged } />
                    <span>{ Math.round((stage.slope / 256) * 100) / 100 }</span>
                    <input name={ `[${stageIndex}].limit` } type='number' min='-128' max='127' value={ stage.limit } onchange={ this.lerpChanged } />
                    <button name={ stageIndex + 1 } onclick={ this.addStage }>+</button>
                    <button name={ stageIndex } onclick={ this.removeStage }>-</button>
                </div>
            );
        }
		return (
            <div class={style.lerp}>
                <div class={style.selector}>
                    { props.modType }: <ArraySelector onselect={this.programSelected} selectedIndex={programIndex} options={programNames} />
                    <input name='loopStart' type='number' min='0' max='7' value={ program.loopStart } onchange={ this.loopChanged } />
                    <input name='loopEnd' type='number' min='0' max='7' value={ program.loopEnd } onchange={ this.loopChanged } />
                    <button name={ program.start } onclick={ this.addStage } disabled={ program.start === 0 }>+</button>
                </div>
				<div class={style.graph}>
					<Lerp appState={ app } program={ props.programIndex } />
				</div>
                <div class={style.controls}>
                    { rows }
                </div>
            </div>
		);
	}
}