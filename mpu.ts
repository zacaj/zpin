import {Socket} from 'net';
import { num, split } from './util';
import { Time, time } from './timer';

const apiVersion = '0.0.1';
const socket = new Socket();
export const MPU = {
    timeOffset: 0 as Time, // add to remote time to get local

    isConnected: false,

    adjust(time: number|string): Time {
        if (typeof time === 'string') time = num(time);
        return (time + (this.timeOffset as number)) as Time;
    },

    lines: {} as {[seq: number]: {
        promise: Promise<string>;
        cb: (resp: string) => void;
        when: Date;
        context: string;
    };},

    async init(ip = '192.168.2.4') {
        console.info('connecting to %s', ip);
        // const socket = new Socket();
        // socket.connect(2908, '192.168.2.4');
        // socket.on('error', )
        try {
            await new Promise((resolve, reject) => {
                // await socket.connect(2908, 'localhost');
                socket.setTimeout(1000);
                socket.setNoDelay(true);
                socket.on('error', err => {
                    console.log('socket error: ', err);
                    reject(err);
                });
                socket.on('close', err => {
                    this.isConnected = false;
                    process.exit(err? 1:0);
                });
                socket.on('data', data => {
                    const lines = data.toString().split('\n').map(s => s.trim()).filter(s => !!s);
                    for (const line of lines) {
                        const parts = split(line, ' ');
                        const seq = line.startsWith('#')? num(parts[0].slice(1)) : 0;
                        const resp = line.startsWith('#')? parts[1] : line;
                        if (this.lines[seq]) {
                            this.lines[seq].cb(resp);
                            delete this.lines[seq];
                        } else
                            throw new Error(`unknown seq # '${seq}'`);
                    }
                });
                socket.connect(2908, ip, async () => {
                    console.log('connected to MPU');
                    this.lines[0] = {
                        promise: null as any,
                        cb: null as any,
                        when: new Date(),
                        context: 'greet',
                    };
                    this.lines[0].promise = new Promise(resolve => this.lines[0].cb = resolve);
                    const greeting = await this.lines[0].promise;

                    console.log('MPU: ', greeting);
                    await this.sendCommand(apiVersion);

                    {
                        const local = time();
                        const remote = parseInt(await this.sendCommand('time'), 10);
                        this.timeOffset = (local - remote) as Time;
                    }

                    this.isConnected = true;
                    resolve();
                });
            });
        } catch (err) {
            console.error('fatal MPU connect error ', err);
            this.isConnected = false;
            throw err;
        }
    },



    async sendCommandCode(cmd: string): Promise<{code: number; resp: string}> {
        let seq: number = 0;
        do {
            seq = (Math.random()*1000)|0;
            if (!seq) continue;
            if (this.lines[seq]) continue;
            break;
        } while (true);
        this.lines[seq] = {
            promise: null as any,
            cb: null as any,
            when: new Date(),
            context: cmd,
        };
        this.lines[seq].promise = new Promise(resolve => this.lines[seq].cb = resolve);
        socket.write(`#${seq} `+cmd+'\n');

        const resp = await this.lines[seq].promise;

        let firstSpace = resp.indexOf(' ');
        if (firstSpace === -1) firstSpace = resp.length;
        const code = parseInt(resp.slice(0, firstSpace), 10);
        if (code >= 200 && code < 300) {
            return {
                resp: resp.slice(firstSpace+1),
                code,
            };
        }
        throw new Error(resp);
    },

    async sendCommand(cmd: string): Promise<string> {
        const resp = await this.sendCommandCode(cmd);
        return resp.resp;
    },
};