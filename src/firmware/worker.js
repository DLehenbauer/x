importScripts('./firmware.js');

const synth = new Module["MidiSynth"]

onmessage = e => {
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
        case 'sample': {
            const outputData = new Float32Array(msg.length);
            const downsampleRatio = 19200 / msg.rate;
            let j = 0, k = -1, sample = 0;
            for (let i = 0; i < outputData.length; i++, j += downsampleRatio) {
                while (k < j) {
                    sample = synth.sample();
                    k++;
                }
                outputData[i] = sample;
            }
            postMessage({
                type: 'audio',
                buffer: outputData.buffer
            }, [outputData.buffer]);
            break;
        }
    }
}