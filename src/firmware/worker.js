importScripts('./firmware.js');

const synth = new Module["MidiSynth"]
const originalSampleRate = Module.getSampleRate();

const channel = new MessageChannel();
const port = channel.port1;

port.onmessage = e => {
    const msg = e.data;
    switch (msg.type) {
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
        case 'setWavetable': {
            const addr = Module.getWavetableAddress(msg.offset);
            Module.HEAP8.set(msg.bytes, addr);
            break;
        }
        case 'getWavetable': {
            const addr = Module.getWavetableAddress(msg.offset);
            const length = Module.getWavetableLength();
            Module.HEAP8.slice(addr, addr + length);
            break;
        }
        case 'sample': {
            const outputData = new Float32Array(msg.length);
            const downsampleRatio = originalSampleRate / msg.rate;
            let j = 0, k = -1, sample = 0;
            for (let i = 0; i < outputData.length; i++, j += downsampleRatio) {
                while (k < j) {
                    sample = synth.sample();
                    k++;
                }
                outputData[i] = sample;
            }
            port.postMessage({
                type: 'audio',
                buffer: outputData.buffer
            }, [outputData.buffer]);
            break;
        }
    }
}

postMessage({ type: 'ready' }, [channel.port2]);