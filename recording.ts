import { Log } from './log';
import { Timer, passTime, setTime, time, wait } from './timer';
import * as fs from 'fs';
import { split, assert, debugging } from './util';
import { matrix } from './switch-matrix';
import { settleForks } from './promises';
import { MPU } from './mpu';
import { initMachine } from './init';
import { Events } from './events';
import { machine } from './machine';

export let curRecording: string|undefined = undefined;
let lines: string[];
let curTime = Number.NEGATIVE_INFINITY;
let curLine = 0;

export function initRecording(recording: string) {
    curRecording = recording;
    Log.log(['console'], 'playing back recording %s', recording);
    Timer.mockTime = 0;
    const file = fs.readFileSync(curRecording!, 'utf8');
    lines = file.split('\n');
    curTime = Number.NEGATIVE_INFINITY;
    curLine = 2;
}

export async function playRecording(toPoint?: string) {
    // await new Promise(r => setTimeout(r, 10000));
    const events = Events;
    const timer = Timer;
    const _machine = machine;
    for (; curLine <= lines.length; curLine++) {
        const line = lines[curLine-1];
        if (line.startsWith('#')) continue;
        if (line && !line.includes(' ')) {
            const bp = line;
            if (bp === 'debug' && debugging()) {
                const nextLine = lines[curLine+1-1];
                debugger;
            } else if (process.env.NODE_ENV === 'test') {
                assert(bp === toPoint, `expected breakpoint ${toPoint} but got '${bp}'`);
                curLine++;
                await settleForks();
                return;
            }
            continue;
        }
        const [ts, sw, stateS, colS, rowS, timeS] = split(line, ' switch \'', '\' state -> ', ' (', ',', ') at ');
        if (timeS === undefined) continue;

        const time = parseInt(timeS, 10);
        if (curTime === Number.NEGATIVE_INFINITY) {
            curTime = time-1;
            await setTime(curTime);
        }
        const diff = time - curTime;
        assert(diff>=0, `time travel not implemented (line ${curLine})`);
        if (diff)
            await passTime(diff);
        curTime = time;

        matrix[parseInt(colS, 10)][parseInt(rowS, 10)]!.changeState(stateS === 'true', 'recording '+curRecording);
        await settleForks();
        await settleForks();
    }
    await settleForks();

    if (process.env.NODE_ENV !== 'test')
        await setTime(undefined);
    Log.log(['console', 'switch'], 'recording %s finished at %i', curRecording, time());
    curRecording = undefined;
}


export async function testRecording(name: string, toPoint?: string) {
    jest.spyOn(Log, 'init').mockImplementation(() => {});
    jest.spyOn(MPU, 'sendCommandCode').mockImplementation(async (cmd) => {
        return {
            code: 200,
            resp: 'mocked',
        };
    });
    await initMachine(false, false, true, false, `./recordings/${name}.rec`, toPoint);
}

export async function continueRecording(toPoint?: string) {
    await playRecording(toPoint);
}
export async function finishRecording() {
    await playRecording();
}
