import {Socket} from 'net';
import {PromiseSocket, TimeoutError} from "promise-socket"
import { Time, time, num } from './util';

const apiVersion = '0.0.1';
let socket = new PromiseSocket();
export const MPU = {
    timeOffset: 0 as Time, // add to remote time to get local

    isConnected: false,

    adjust(time: number|string): Time {
        if (typeof time === 'string') time = num(time);
        return (time + this.timeOffset) as Time;
    },

    async init() {
        // const socket = new Socket();
        // socket.connect(2908, '192.168.2.4');
        // socket.on('error', )
        try {
            // await socket.connect(2908, 'localhost');
            await socket.connect(2908, '192.168.2.4');
            console.log('connected to MPU');
            const greeting = await this.readLine();
            console.log('MPU: ', greeting);
            socket.setTimeout(1000);
            await this.sendCommand(apiVersion);
            socket.socket.on('error', err => {
                console.log('socket error: ', err);
            });
            socket.socket.on('close', err => {
                this.isConnected = false;
                process.exit(err? 1:0);
            });

            {
                const local = time();
                const remote = parseInt(await this.sendCommand('time'), 10);
                this.timeOffset = (local - remote) as Time;
            }

            this.isConnected = true;
        } catch (err) {
            console.error('fatal MPU connect error ', err);
            this.isConnected = false;
        }
    },

    async sendCommandCode(cmd: string): Promise<{code: number; resp: string}> {
        await socket.write(cmd+'\n');
        const resp = await this.readLine();
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

    extraRead: [] as string[],
    async readLine(): Promise<string> {
        if (!this.extraRead.length) {
            const resp = (await socket.read())!.toString().split('\n').map(s=>s.trim()).filter(s => !!s);
            this.extraRead = [...this.extraRead, ...resp];
        }
        return this.extraRead.shift()!;
    },

    async sendCommand(cmd: string): Promise<string> {
        const resp = await this.sendCommandCode(cmd);
        return resp.resp;
    }
}