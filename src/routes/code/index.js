import { h, Component } from 'preact';
import style from './style';

class CodeSink {
    indentPrefix = "";
    newlinePending = false;
    text = "";

    indent(block) {
        this.indentPrefix += "    ";
        block();
        this.indentPrefix = this.indentPrefix.substring(4);
    }

    out(text) {
        if (this.newlinePending) {
            this.text += '\n';
            this.text += this.indentPrefix;
            this.newlinePending = false;
        }

        this.text += text;
    }

    outLn(text) {
        if (typeof text === 'undefined') {
            text = '';
        }

        this.out(text);
        this.newlinePending = true;
    }
}

export default class Settings extends Component {
    pad(padding, text) {
        text = "" + text;
        return padding.substr(text.length) + text;
    }

    hex8(value) {
        const hex = (value & 0xFF).toString(16);
        return this.pad("00", hex);
    }

    hex16(value) {
        const hex = (value & 0xFFFF).toString(16);
        return this.pad("0000", hex);
    }

    array(cs, type, name, size, block) {
        cs.outLn(`static constexpr ${type} ${name}[${size}] PROGMEM = {`);
        cs.indent(() => {
            block();
        })
        cs.outLn('};');
    }

    lerpStages(cs, stages) {
        this.array(cs, 'LerpStage', 'LerpStages', 'LERP_ARRAY_SIZE', () => {
            stages.forEach((stage, index) => {
                cs.outLn(`/* ${this.hex8(index)}: */ { ${this.pad("      ", stage.slope)}, ${this.pad("    ", stage.limit)} },`);
            });
        });
    }

    lerpProgressions(cs, progressions) {
        this.array(cs, 'uint8_t', 'LerpProgressions', 'LERP_ARRAY_SIZE', () => {
            cs.out(`/* 00: */ `);
            progressions.forEach((value, index) => {
                cs.out(`0x${this.hex8(value)}, `);
                if (value === 0x0) {
                    cs.outLn();
                    if (index !== progressions.length - 1) {
                        cs.out(`/* ${this.hex8(index + 1)}: */ `);
                    }
                }
            });
        });
    }

    lerpPrograms(cs, programs) {
        this.array(cs, 'LerpProgram', 'LerpPrograms', 'LERP_ARRAY_SIZE', () => {
            programs.forEach((program, index) => {
                cs.outLn(`/* ${this.hex8(index)}: */ { 0x${this.hex8(program.start)}, 0x${this.hex8(program.loopStart << 4 | program.loopEnd)} },`);
            });
        });
    }

    wavetable(cs, wavetable) {
        this.array(cs, 'int8_t', 'Waveforms', 'WAVETABLE_SIZE', () => {
            let bytes = wavetable.map(byte => {
                let asString = byte.toString();
                return this.pad("    ", asString) + ",";
            });
    
            for (let i = 0; i < bytes.length; i += 32) {
                if ((i & 0xFF) === 0) {
                    if (i > 0) {
                        cs.outLn();
                    }
                    cs.outLn(`/* Wave ${i >> 8} */`);
                }
    
                cs.out(`/* ${this.hex16(i)}: */ `)
                cs.outLn(bytes.slice(i, i + 32).join(' '));
            }
        });
    }

    instruments(cs, instruments) {
        this.array(cs, 'Instrument', 'instruments', '', () => {
            instruments.forEach((instrument, index) => {
                const indexAsString = this.pad("   ", index);
                const name = this.pad("                            ", instrument.name);
                cs.outLn(`/* ${indexAsString}: ${name} */ {`);
                cs.indent(() => {
                    cs.outLn(`/* waveOffset: */ &Waveforms[${instrument.waveOffset}],`);
                    cs.outLn(`/* ampMod:     */ ${instrument.ampMod},`);
                    cs.outLn(`/* freqMod:    */ ${instrument.freqMod},`);
                    cs.outLn(`/* waveMod:    */ ${instrument.waveMod},`);
                    cs.outLn(`/* xor:        */ ${instrument.xor},`);
                    cs.outLn(`/* flags:      */ static_cast<InstrumentFlags>(${instrument.flags})`);
                });
                cs.outLn('},');
            });
        });
    }

    percussionNotes(cs, notes, instruments) {
        this.array(cs, 'uint8_t', 'percussionNotes', '', () => {
            notes.forEach((value, index) => {
                const name = this.pad("                  ", instruments[index + 0x80].name);
                cs.out(`/* ${index + 35}: ${name} */ 0x${this.hex8(value)}, `);
                cs.outLn();
            });
        });
    }

    cpp(cs, model) {
        cs.outLn('#ifdef __EMSCRIPTEN__');
        cs.outLn('#define LERP_ARRAY_SIZE 256');
        cs.outLn('#define WAVETABLE_SIZE 96*256');
        cs.outLn('#else');
        cs.outLn('#define LERP_ARRAY_SIZE');
        cs.outLn('#define WAVETABLE_SIZE');
        cs.outLn('#endif');
        cs.outLn();
        this.lerpProgressions(cs, model.lerpProgressions); cs.outLn();
        this.lerpStages(cs, model.lerpStages); cs.outLn();
        this.lerpPrograms(cs, model.lerpPrograms); cs.outLn();
        this.wavetable(cs, model.wavetable); cs.outLn();
        this.instruments(cs, model.instruments); cs.outLn();
        this.percussionNotes(cs, model.percussionNotes, model.instruments); cs.outLn();
    }

	copyToClipboard = () => {
		const r = document.createRange();
		r.selectNodeContents(document.getElementById('code'));
		const sel = window.getSelection(); 
		sel.removeAllRanges(); 
		sel.addRange(r); 
		document.execCommand('copy');
	};

	render(props) {
        if (!props.appState.ready) {
            return;
        }

        const cs = new CodeSink();
        this.cpp(cs, props.appState.model);

		return (
            <div class={style.code}>
            <button id="copyButton" onclick={this.copyToClipboard} class={style.button}>Copy</button>
			<pre id='code'>
				{cs.text}
			</pre>
            </div>
		);
	}
}