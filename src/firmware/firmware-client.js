export default class Firmware {
    constructor() {
        this.sent = 0;
        this.received = 0;
        this.resolvers = [];

        this.connected = new Promise(accept => {
            let worker;
            let workerListener = e => {
                this.port = e.ports[0];
                this.port.onmessage = e => this.dispatch(e);
                accept();
                worker.removeEventListener('message', workerListener);
            }
    
            worker = new Worker('firmware/worker.js');
            worker.addEventListener('message', workerListener);
        });
    }

    send(message) {
        return new Promise(accept => {
            const id = this.sent++;
            this.resolvers.push({id, accept});
            this.port.postMessage(message);
        });
    }

    dispatch(e) {
        const response = this.resolvers.shift();
        console.assert(this.received === response.id);
        this.received++;
        response.accept(e.data);
    }

    noteOn(channel, note, velocity) {
        this.port.postMessage({type: 'noteOn', channel, note, velocity});
    }

    noteOff(channel, note) {
        this.port.postMessage({type: 'noteOff', channel, note});
    }

    programChange(channel, program) {
        this.port.postMessage({type: 'programChange', channel, program});
    }

    midi(data) {
        this.port.postMessage({type: 'midi', data});
    }

    getSampleRate = () => {
        return this.send({type: 'getSampleRate'}).then(response => {
            return response.rate;
        });
    }

    setPercussionNotes = (bytes) => {
        this.port.postMessage({type: 'setPercussionNotes', bytes});
    }

    getPercussionNotes = () => {
        return this.send({type: 'getPercussionNotes'}).then(response => {
            return Array.prototype.slice.apply(new Uint8Array(response.buffer));
        });
    }

    setWavetable = (offset, bytes) => {
        this.port.postMessage({type: 'setWavetable', offset, bytes});
    }

    getWavetable = () => {
        return this.send({type: 'getWavetable'}).then(response => {
            return Array.prototype.slice.apply(new Int8Array(response.buffer));
        });
    }

    getWavetableAddress = () => {
        return this.send({type:'getWavetableAddress'}).then(response => response.start);
    }

    getInstruments = () => {
        return this.getWavetableAddress().then(waveStart => {
            return this.send({type: 'getInstruments'}).then(response => {
                const dv = new DataView(response.buffer);
    
                const instruments = [];
                for (let i = 0; i < response.buffer.byteLength;) {
                    const waveOffset = dv.getUint32(i, /* littleEndian: */ true) - waveStart; i += 4;
                    const ampMod = dv.getUint8(i, /* littleEndian: */ true); i += 1;
                    const freqMod = dv.getUint8(i, /* littleEndian: */ true); i += 1;
                    const waveMod = dv.getUint8(i, /* littleEndian: */ true); i += 1;
                    const xor = dv.getUint8(i, /* littleEndian: */ true); i += 1;
                    const flags = dv.getUint8(i, /* littleEndian: */ true); i += 1;
                    i += 3;
                    instruments.push({ waveOffset, ampMod, freqMod, waveMod, xor, flags });
                }

                return instruments;
            });
        });
    }

    setInstruments = (instruments) => {
        return this.getWavetableAddress().then(waveStart => {
            const buffer = new ArrayBuffer(instruments.length * 12);
            const dv = new DataView(buffer);
            let i = 0;
            for (const instrument of instruments) {
                dv.setUint32(i, instrument.waveOffset + waveStart, /* littleEndian: */ true); i += 4;
                dv.setUint8(i, instrument.ampMod); i += 1;
                dv.setUint8(i, instrument.freqMod); i += 1;
                dv.setUint8(i, instrument.waveMod); i += 1;
                dv.setUint8(i, instrument.xor); i += 1;
                dv.setUint8(i, instrument.flags); i += 1;
                i += 3;
            }
            this.port.postMessage({type: 'setInstruments', buffer}, [buffer]);
        });
    }

    getLerpStages = () => {
        return this.send({type: 'getLerpStages'}).then(response => {
            const dv = new DataView(response.buffer);

            const stages = [];
            for (let i = 0; i < response.buffer.byteLength;) {
                const slope = dv.getInt16(i, /* littleEndian: */ true); i += 2;
                const limit = dv.getInt8(i, /* littleEndian: */ true); i += 2;
                stages.push({ slope, limit });
            }

            return stages;
        });
    }

    setLerpStages = (stages) => {
        const buffer = new ArrayBuffer(stages.length * 4);
        const dv = new DataView(buffer);
        let i = 0;
        stages.forEach(stage => {
            dv.setInt16(i, stage.slope, /* littleEndian: */ true); i += 2;
            dv.setInt8(i, stage.limit, /* littleEndian: */ true); i += 2;
        });

        this.port.postMessage({ type: 'setLerpStages', buffer }, [buffer]);
    }

    getLerpPrograms = () => {
        return this.send({type: 'getLerpPrograms'}).then(response => {
            const dv = new DataView(response.buffer);

            const programs = [];
            for (let i = 0; i < response.buffer.byteLength;) {
                const start = dv.getUint8(i++);
                const loopStartAndEnd = dv.getUint8(i++);
                programs.push({
                    start,
                    loopStart: loopStartAndEnd >> 4,
                    loopEnd: loopStartAndEnd & 0x0F
                })
            }

            return programs;
        });
    }

    setLerpPrograms = programs => {
        const buffer = new ArrayBuffer(programs.length * 2);
        const dv = new DataView(buffer);
        let i = 0;
        programs.forEach(program => {
            dv.setUint8(i, program.start, /* littleEndian: */ true); i++;
            dv.setUint8(i, program.loopStart << 4 | program.loopEnd, /* littleEndian: */ true); i++;
        });

        this.port.postMessage({ type: 'setLerpPrograms', buffer }, [buffer]);
    };

    sample(length, rate) {
        return this.send({ type: 'sample', length, rate }).then(response => {
            return new Float32Array(response.buffer);
        });
    }

    plotLerp(program, length) {
        return this.send({ type: 'plotLerp', program, length }).then(response => {
            return new Uint8Array(response.buffer);
        });
    }

    syncInfo = [
        { path: "percussionNotes", get: this.getPercussionNotes, set: this.setPercussionNotes },
        { path: "instruments", get: this.getInstruments, set: this.setInstruments },
        { path: "wavetable", get: this.getWavetable, set: (table) => this.setWavetable(0, table) },
        { path: "lerpPrograms", get: this.getLerpPrograms, set: this.setLerpPrograms },
        { path: "lerpStages", get: this.getLerpStages, set: this.setLerpStages },
    ];

	sync(model) {
		return Promise.all(this.syncInfo.map(info => info.set(model[info.path])));
	}

	reset(set) {
        return Promise.all(this.syncInfo.map(info => info.get())).then(values => {
            values.forEach((value, index) => {
                set([this.syncInfo[index].path], value);
            });
        })
	}
}