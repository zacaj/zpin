import {Socket} from 'net';
import { num, split } from './util';
import { Time, time } from './timer';
import { Log } from './log';

const apiVersion = '0.0.1';
const socket = new Socket();
export const MPU = {
    timeOffset: 0 as Time, // add to remote time to get local

    isConnected: false,

    adjust(time: number|string): Time { // convert remote time to local
        if (typeof time === 'string') time = num(time);
        return (time + (this.timeOffset as number)) as Time;
    },

    lines: {} as {[seq: number]: {
        promise: Promise<string>;
        cb: (resp: string) => void;
        when: Date;
        context: string;
    };},

    async init(ip = '192.168.2.8') {
        Log.log(['mpu', 'console'], 'connecting to %s', ip);
        // const socket = new Socket();
        // socket.connect(2908, '192.168.2.4');
        // socket.on('error', )
        try {
            await new Promise((resolve, reject) => {
                // await socket.connect(2908, 'localhost');
                socket.setTimeout(1000);
                socket.setNoDelay(true);
                socket.on('error', err => {
                    Log.error(['mpu', 'console'],'socket error: ', err);
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
                    Log.info(['mpu', 'console'],'connected to MPU');
                    this.lines[0] = {
                        promise: null as any,
                        cb: null as any,
                        when: new Date(),
                        context: 'greet',
                    };
                    this.lines[0].promise = new Promise(resolve => this.lines[0].cb = resolve);
                    const greeting = await this.lines[0].promise;

                    Log.info(['mpu'],'MPU: ', greeting);
                    await this.sendCommand(apiVersion, true);

                    {
                        const local = time();
                        const remote = parseInt(await this.sendCommand('time', true), 10);
                        this.timeOffset = (local - remote) as Time;
                    }

                    this.isConnected = true;
                    resolve();
                });
            });
        } catch (err) {
            Log.error(['mpu', 'console'], 'fatal MPU connect error ', err);
            this.isConnected = false;
            throw err;
        }
    },



    async sendCommandCode(cmd: string, force = false): Promise<{code: number; resp: string}> {
        if (!this.isConnected && !force) {
            Log.info('mpu', 'ignoring command %s, not connected', cmd);
            return { code: 200, resp: '' };
        }
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
        Log.info('mpu', 'send command %s', `#${seq} `+cmd+'\n');
        this.lines[seq].promise = new Promise(resolve => this.lines[seq].cb = resolve);
        socket.write(`#${seq} `+cmd+'\n');

        const resp = await this.lines[seq].promise;
        Log.info('mpu', 'got response #%i %s', seq, resp);

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

    async sendCommand(cmd: string, force = false): Promise<string> {
        const resp = await this.sendCommandCode(cmd, force);
        return resp.resp;
    },
};