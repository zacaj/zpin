import * as fs from 'fs';
import * as util from 'util';
import { OrArray, arrayify } from './util';
import { time, Time } from './timer';
const truncate = require('truncate-logs');

enum Levels {
    Trace = -1,
    Info = 0,
    Log = 1,
    Error = 2,
}
export type LogCategory = 
    'console' |
    'switch' |
    'mpu' |
    'solenoid' |
    'machine' |
    'gfx' |
    'game';
const files = [
    'console',
    'switch',
    'mpu',
    'solenoid',
    'machine',
    'gfx',
    'game',
];

export class Log {
    static files: { [name: string]: number} = {} as any;

    static timestamp(): string {
        const d = new Date();
        return d.getMinutes().toFixed().padStart(2, '0')+':'+d.getSeconds().toFixed().padStart(2, '0')+'.'+d.getMilliseconds().toFixed().padStart(3, '0');
    }

    static logMessage(level: Levels, categories: OrArray<LogCategory>, message: string, ...params: any[]) {
        const ts = Log.timestamp()+' ';
        if (categories.includes('console') || level >= Levels.Log)
            console[level >= Levels.Error? 'error' : 'log'](ts+message, ...params);
        Log.write(Log.files.all, ts+Log.format(message, params)+'; \t\t'+JSON.stringify(categories)+' ');
        Log.trace(categories, message, ...params);
        for (const cat of arrayify(categories)) {
           Log.write(Log.files[cat], ts+Log.format(message, params));
        }
    }

    private static lastTrace: Time;
    static trace(categories: OrArray<LogCategory>, message: string, ...params: any[]) {
        const ts = Log.timestamp()+' ';
        Log.write(Log.files.trace, ts+JSON.stringify(categories)+' '+Log.format(message, params));
        if (time() - Log.lastTrace > 5*60*60*1000)
            truncate('trace.log', {lines: 50000});
    }

    static info(categories: OrArray<LogCategory>, message: string, ...params: any[]) {
        return Log.logMessage(Levels.Info, categories, message, ...params);
    }

    static log(categories: OrArray<LogCategory>, message: string, ...params: any[]) {
        return Log.logMessage(Levels.Log, categories, message, ...params);
    }

    static error(categories: OrArray<LogCategory>, message: string, ...params: any[]) {
        return Log.logMessage(Levels.Error, categories, message, params);
    }

    static format(message: string, params: any): string {
        if (params.length === 0)
            return message;
        return util.format.apply(util, [message, ...params]);
    }

    static write(fil: number, message: string) {
        fs.writeSync(fil, message+'\n');
    }

    static init() {
        Log.lastTrace = time();
        for (const f of files) {
            Log.files[f] = fs.openSync(f+'.log', 'w');
            Log.write(Log.files[f], `${new Date()}`);
        }
        Log.files.all= fs.openSync('all.log', 'w');
        Log.write(Log.files.all, `${new Date()}`);
        Log.files.trace= fs.openSync('trace.log', 'w');
        Log.write(Log.files.trace, `${new Date()}`);
    }
}