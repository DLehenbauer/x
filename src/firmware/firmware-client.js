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

    midi(data) {
        this.port.postMessage({type: 'midi', data});
    }

    getSampleRate() {
        return this.send({type: 'getSampleRate'}).then(response => {
            return response.rate;
        });
    }

    setWavetable(offset, bytes) {
        this.port.postMessage({type: 'setWavetable', offset, bytes});        
    }

    getWavetable() {
        return this.send({type: 'getWavetable'}).then(response => {
            return Array.prototype.slice.apply(new Int8Array(response.buffer));
        });
    }

    getLerpStages() {
        return this.send({type: 'getLerpStages'}).then(response => {
            const dv = new DataView(response.buffer);

            const stages = [];
            for (let i = 0; i < response.buffer.byteLength;) {
                const slope = dv.getInt16(i, /* littleEndian: */ true); i += 2;
                const limit = dv.getUint8(i, /* littleEndian: */ true); i += 2;
                stages.push({ slope, limit });
            }

            return stages;
        });
    }

    setLerpStages(stages) {
        const buffer = new ArrayBuffer(stages.length * 4);
        const dv = new DataView(buffer);
        let i = 0;
        stages.forEach(stage => {
            dv.setInt16(i, stage.slope, /* littleEndian: */ true); i += 2;
            dv.setInt8(i, stage.limit, /* littleEndian: */ true); i += 2;
        });

        this.port.postMessage({ type: 'setLerpStages', buffer }, [buffer]);
    }

    getLerpPrograms() {
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

    getLerpProgressions() {
        return this.send({type: 'getLerpProgressions'}).then(response => {
            return new Uint8Array(response.buffer);
        });
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
}