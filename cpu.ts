import {Socket} from 'net';
import { num, split } from './util';
import { Time, time, wait } from './timer';
import { Log } from './log';
import { fork } from './promises';
import { Image, machine } from './machine';

const apiVersion = '1';
const socket = new Socket();

export const CPU = {
    isConnected: false,

    lines: {} as {[seq: number]: {
        promise: Promise<string>;
        cb: (resp: string) => void;
        when: Date;
        context: string;
    };},

    ip: '192.168.10.2',

    timeout: 10,
    connecting: false,

    async init(ip?: string) {
        // this.ip = '192.168.2.11';
        if (ip) this.ip = ip;

        socket.setTimeout(1000);
        socket.setNoDelay(true);
        socket.on('error', err => {
            Log.error(['cpu', 'console'],'socket error: ', err);
        });
        socket.on('close', err => {
            this.isConnected = false;
            this.connecting = false;
            Log.error(['cpu', 'console'], 'lost connection to CPU', err);
            this.reconnect();
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
        this.connect();
    },

    reconnect() {
        if (this.connecting) return;
        this.connecting = true;
        fork(wait(this.timeout*1000).then(() => this.connect()));
        Log.info('cpu', 'reconnect to CPU in %is', this.timeout);
        if (this.timeout < 30)
            this.timeout *= 2;
    },

    connect() {
        this.connecting = true;
        Log.info(['cpu'], 'connecting to %s', this.ip);
        socket.connect(2909, this.ip, async () => {
            Log.info(['cpu'],'reached CPU');
            this.lines[0] = {
                promise: null as any,
                cb: null as any,
                when: new Date(),
                context: 'greet',
            };
            this.lines[0].promise = new Promise(resolve => this.lines[0].cb = resolve);
            const greeting = await this.lines[0].promise;

            Log.info(['cpu'],'CPU: ', greeting);
            await this.sendCommand(apiVersion, true);

            this.isConnected = true;
            this.connecting = false;
            this.timeout = 10;
            Log.log(['cpu', 'console'], 'connected to CPU');

            for (const key of Object.keys(machine)) {
                const obj = (machine as any)[key];
                if (obj instanceof Image)
                    await obj.syncDisp();
            }
            for (const t of machine.dropTargets) {
                if (t.image)
                    await t.image.syncDisp();
            }
        });
    },


    async sendCommandCode(cmd: string, force = false): Promise<{code: number; resp: string}> {
        if (!this.isConnected && !force) {
            Log.info('cpu', 'ignoring command %s, not connected', cmd);
            return { code: 200, resp: '' };
        }
        let seq: number = 0;
        if (this.isConnected) {
            do {
                seq = (Math.random()*1000)|0;
                if (!seq) continue;
                if (this.lines[seq]) continue;
                break;
            } while (true);
        }
        this.lines[seq] = {
            promise: null as any,
            cb: null as any,
            when: new Date(),
            context: cmd,
        };
        Log.info('cpu', 'send command %s', `#${seq} `+cmd+'\n');
        this.lines[seq].promise = new Promise(resolve => this.lines[seq].cb = resolve);
        socket.write((this.isConnected? `#${seq} `:'')+cmd+'\n');

        const resp = await this.lines[seq].promise;
        Log.info('cpu', 'got response #%i %s', seq, resp);

        let firstSpace = resp.indexOf(' ');
        if (firstSpace === -1) firstSpace = resp.length;
        const code = parseInt(resp.slice(0, firstSpace), 10);
        if (code >= 200 && code < 300) {
            return {
                resp: resp.slice(firstSpace+1),
                code,
            };
        }
        Log.error('cpu', 'error running command %s: ', cmd, resp);
        debugger;
        throw new Error(resp);
    },

    async sendCommand(cmd: string, force = false): Promise<string> {
        const resp = await this.sendCommandCode(cmd, force);
        return resp.resp;
    },
};