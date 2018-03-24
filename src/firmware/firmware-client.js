export default class Firmware {
    constructor() {
        this.sent = 0;
        this.received = 0;
        this.resolvers = [];

        this.connected = new Promise(accept => {
            let worker;
            let workerListener = e => {
                this.port = e.ports[0];
                this.sampleRate = e.data.sampleRate;

                // Merge the returned information about the memory layout of the firmware into
                // our 'syncInfo' table.
                Object.getOwnPropertyNames(e.data.layout).forEach(name => {
                    this.marshallingInfo[name].memory = e.data.layout[name];
                });

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

    load(marshal) {
        return this.send({ type: 'load', memory: marshal.memory }).then(
            response => marshal.unpack(response.buffer));
    }

    store(marshal, value) {
        const buffer = marshal.pack(value);
        this.port.postMessage({ type: 'store', memory: marshal.memory, buffer }, [buffer]);
    }

    unpackPercussionNotes = buffer => Array.prototype.slice.apply(new Uint8Array(buffer))
    packPercussionNotes = notes => new Uint8Array(notes).buffer;

    setPercussionNotes = notes => this.store(this.marshallingInfo.percussionNotes, notes);
    getPercussionNotes = () => this.load(this.marshallingInfo.percussionNotes);

    unpackWavetable = buffer => Array.prototype.slice.apply(new Int8Array(buffer));
    packWavetable = table => new Int8Array(table).buffer;

    setWavetable = table => this.store(this.marshallingInfo.wavetable, table);
    getWavetable = () => this.load(this.marshallingInfo.wavetable);

    unpackInstruments = buffer => {
        const waveStart = this.marshallingInfo.wavetable.memory.start;
        const dv = new DataView(buffer);

        const instruments = [];
        for (let i = 0; i < buffer.byteLength;) {
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
    }

    packInstruments = instruments => {
        const waveStart = this.marshallingInfo.wavetable.memory.start;
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
        return buffer;
    }

    setInstruments = instruments => this.store(this.marshallingInfo.instruments, instruments);
    getInstruments = () => this.load(this.marshallingInfo.instruments);

    unpackLerpStages = buffer => {
        const dv = new DataView(buffer);

        const stages = [];
        for (let i = 0; i < buffer.byteLength;) {
            const slope = dv.getInt16(i, /* littleEndian: */ true); i += 2;
            const limit = dv.getInt8(i, /* littleEndian: */ true); i += 2;
            stages.push({ slope, limit });
        }

        return stages;
    }

    packLerpStages = stages => {
        const buffer = new ArrayBuffer(stages.length * 4);
        const dv = new DataView(buffer);

        let i = 0;
        stages.forEach(stage => {
            dv.setInt16(i, stage.slope, /* littleEndian: */ true); i += 2;
            dv.setInt8(i, stage.limit, /* littleEndian: */ true); i += 2;
        });

        return buffer;
    }

    setLerpStages = stages => this.store(this.marshallingInfo.lerpStages, stages);
    getLerpStages = () => this.load(this.marshallingInfo.lerpStages);

    unpackLerpPrograms = buffer => {
        const dv = new DataView(buffer);

        const programs = [];
        for (let i = 0; i < buffer.byteLength;) {
            const start = dv.getUint8(i++);
            const loopStartAndEnd = dv.getUint8(i++);
            programs.push({
                start,
                loopStart: loopStartAndEnd >> 4,
                loopEnd: loopStartAndEnd & 0x0F
            });
        }

        return programs;
    }

    packLerpPrograms = programs => {
        const buffer = new ArrayBuffer(programs.length * 2);
        const dv = new DataView(buffer);

        let i = 0;
        programs.forEach(program => {
            dv.setUint8(i, program.start, /* littleEndian: */ true); i++;
            dv.setUint8(i, program.loopStart << 4 | program.loopEnd, /* littleEndian: */ true); i++;
        });

        return buffer;
    };

    setLerpPrograms = programs => this.store(this.marshallingInfo.lerpPrograms, programs);
    getLerpPrograms = () => this.load(this.marshallingInfo.lerpPrograms);

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

    marshallingInfo = {
        percussionNotes: { unpack: this.unpackPercussionNotes, pack: this.packPercussionNotes },
        instruments: { unpack: this.unpackInstruments, pack: this.packInstruments },
        wavetable: { unpack: this.unpackWavetable, pack: this.packWavetable },
        lerpPrograms: { unpack: this.unpackLerpPrograms, pack: this.packLerpPrograms },
        lerpStages: { unpack: this.unpackLerpStages, pack: this.packLerpStages },
    };

    /** Stores the given settings to the Firmware. */
	storeAll(settings) {
        Object.getOwnPropertyNames(this.marshallingInfo)
            .forEach(path => this.store(this.marshallingInfo[path], settings[path]));
	}

    /** Loads the current Firmware settings, updating the JavaScript model via the given setter. */
	loadAll(set) {
        const paths = Object.getOwnPropertyNames(this.marshallingInfo);
        const loads = paths.map(path => {
            return this.load(this.marshallingInfo[path]).then(value => {
                set(path, value);
            });
        });

        return Promise.all(loads);
	}
}