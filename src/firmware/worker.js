importScripts('./firmware.js');

const synth = new Module["MidiSynth"]
const originalSampleRate = Module.getSampleRate();

const channel = new MessageChannel();
const port = channel.port1;

const load = (memory, msgType) => {
    const buffer = Module.HEAP8.slice(memory.start, memory.end).buffer;
    port.postMessage({
        type: msgType,
        buffer: buffer
    }, [buffer]);
}

const store = (memory, bytes) => {
    Module.HEAP8.set(bytes, memory.start);
}

port.onmessage = e => {
    const msg = e.data;
    switch (msg.type) {
        case 'getSampleRate': {
            port.postMessage({
                type: 'sampleRate',
                rate: originalSampleRate
            });
            break;
        }
        case 'midi': {
            for (const byte of msg.data) {
                Module.midi_decode_byte(byte);
            }
            break;
        }
        case 'noteOn': {
            console.log(JSON.stringify(msg));
            synth.midiNoteOn(msg.channel, msg.note, msg.velocity);
            break;
        }
        case 'noteOff': {
            console.log(JSON.stringify(msg));
            synth.midiNoteOff(msg.channel, msg.note);
            break;
        }
        case 'getWavetable': {
            load(Module.getWavetable(), 'wavetable');
            break;
        }
        case 'setWavetable': {
            store(Module.getWavetable(), msg.bytes);
            break;
        }
        case 'getLerpPrograms': {
            load(Module.getLerpPrograms(), 'lerpPrograms');
            break;
        }
        case 'setLerpPrograms': {
            store(Module.getLerpPrograms(), new Int8Array(msg.buffer));
            break;
        }
        case 'getLerpProgressions': {
            load(Module.getLerpProgressions(), 'lerpProgressions');
            break;
        }
        case 'setLerpProgressions': {
            store(Module.getLerpProgressions(), new Int8Array(msg.buffer));
            break;
        }
        case 'getLerpStages': {
            load(Module.getLerpStages(), 'lerpStages');
            break;
        }
        case 'setLerpStages': {
            store(Module.getLerpStages(), new Int8Array(msg.buffer));
            break;
        }
        case 'sample': {
            const outputData = new Float32Array(msg.length);
            const downsampleRatio = originalSampleRate / msg.rate;
            
            let s0 = synth.sample();
            let s1 = synth.sample();
            let j = 0, k = 1;

            for (let i = 0; i < outputData.length; i++, j += downsampleRatio) {
                while (j > k) {
                    s0 = s1;
                    s1 = synth.sample();
                    k++;
                }

                const t = j % 1;
                const s = (1 - t) * s0 + t * s1;
                outputData[i] = (s / 0x8000) - 1;

                if (outputData[i] > 1 || outputData[i] < -1) {
                    console.log(outputData[i]);
                }
            }

            port.postMessage({
                type: 'audio',
                buffer: outputData.buffer
            }, [outputData.buffer]);
            break;
        }
        case 'plotLerp': {
            const lerp = new Module["Lerp"];
            lerp.start(msg.program);

            const u8 = new Uint8Array(msg.length);
            for (let i = 0; i < u8.length; i++) {
                u8[i] = lerp.sample();
            }

            port.postMessage({
                type: 'plot', buffer: u8.buffer
            }, [u8.buffer]);
            break;
        }
        default:
            console.assert(false, `Unknown 'msg.type': ${msg.type}`);
            break;
    }
}

postMessage({ type: 'ready' }, [channel.port2]);