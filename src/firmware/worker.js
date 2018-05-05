importScripts('./firmware.js');

const synth = Module.getSynth();
const originalSampleRate = Module.getSampleRate();
const layout = {
    percussionNotes: Module.getPercussionNotes(),
    wavetable: Module.getWavetable(),
    envelopeStages: Module.getEnvelopeStages(),
    envelopePrograms: Module.getEnvelopePrograms(),
    instruments: Module.getInstruments(),
}

const channel = new MessageChannel();
const port = channel.port1;

port.onmessage = e => {
    const msg = e.data;
    switch (msg.type) {
        case 'load': {
            const memory = msg.memory;
            const buffer = Module.HEAP8.slice(memory.start, memory.end).buffer;
            port.postMessage({
                type: 'load',
                buffer: buffer
            }, [buffer]);
            break;
        }
        case 'store': {
            const memory = msg.memory;
            const buffer = msg.buffer;
            if (memory.start + buffer.length > memory.end) {
                throw new Error('Write outside of memory range.');
            }
            Module.HEAP8.set(new Int8Array(buffer), memory.start);
            break;
        }
        case 'midi': {
            for (const byte of msg.data) {
                Module.midi_decode_byte(byte);
            }
            break;
        }
        case 'noteOn': {
            synth.midiNoteOn(msg.channel, msg.note, msg.velocity);
            break;
        }
        case 'noteOff': {
            synth.midiNoteOff(msg.channel, msg.note);
            break;
        }
        case 'programChange': {
            synth.midiProgramChange(msg.channel, msg.program);
            break;
        }
        case 'sample': {
            const outputData = new Float32Array(msg.length);
            const downsampleRatio = originalSampleRate / msg.rate;
            
            let s0 = Module.sample();
            let s1 = Module.sample();
            let j = 0, k = 1;

            for (let i = 0; i < outputData.length; i++, j += downsampleRatio) {
                while (j > k) {
                    s0 = s1;
                    s1 = Module.sample();
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
        case 'plotEnvelope': {
            const envelope = new Module["Envelope"];
            envelope.start(msg.program);

            let previousStage = 0;
            const stageBoundaries = [];
            const u8 = new Uint8Array(msg.length);
            for (let i = 0; i < u8.length; i++) {
                u8[i] = envelope.sample();
                const nextStage = envelope.getStageIndex();
                if (nextStage !== previousStage) {
                    stageBoundaries.push(i);
                    previousStage = nextStage;
                }
            }

            port.postMessage({
                type: 'plot', buffer: u8.buffer, stageBoundaries
            }, [u8.buffer]);
            break;
        }
        default:
            console.assert(false, `Unknown 'msg.type': ${msg.type}`);
            break;
    }
}

postMessage({ type: 'ready', sampleRate: originalSampleRate, layout }, [channel.port2]);