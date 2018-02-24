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

    sample(length, rate) {
        return this.send({ type: 'sample', length, rate }).then(response => {
            return new Float32Array(response.buffer);
        });
    }
}