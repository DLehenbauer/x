importScripts('./synth.js');

const synth = new Module["Synth"]

onmessage = e => {
    const msg = e.data;
    switch (msg.type) {
        case 'noteOn': {
            console.log(JSON.stringify(msg));
            synth.noteOn(msg.voice, msg.note, msg.velocity, msg.instrument);
            break;
        }
        case 'noteOff': {
            console.log(JSON.stringify(msg));
            synth.noteOff(msg.voice);
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