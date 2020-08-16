import { Log } from './log';
import { Timer, passTime, setTime } from './timer';
import * as fs from 'fs';
import { split, assert } from './util';
import { matrix } from './switch-matrix';
import { settleForks } from './promises';
import { MPU } from './mpu';
import { initMachine } from './init';

export let curRecording: string|undefined = undefined;
let lines: string[];
let curTime = 0;
let curLine = 0;

export function initRecording(recording: string) {
    curRecording = recording;
    Log.log(['console'], 'playing back recording %s', recording);
    Timer.mockTime = 0;
    const file = fs.readFileSync(curRecording!, 'utf8');
    lines = file.split('\n');
    curTime = 0;
    curLine = 0;
}

export async function playRecording(toPoint?: string) {
    for (; curLine < lines.length; curLine++) {
        const line = lines[curLine];
        if (line && !line.includes(' ')) {
            if (process.env.NODE_ENV === 'test') {
                const bp = line;
                assert(bp === toPoint, `expected breakpoint ${toPoint} but got '${bp}'`);
                curLine++;
                await settleForks();
                return;
            } else continue;
        }
        const [ts, sw, stateS, colS, rowS, timeS] = split(line, ' switch \'', '\' state -> ', ' (', ',', ') at ');
        if (timeS === undefined) continue;

        const time = parseInt(timeS, 10);
        const diff = time - curTime;
        if (diff)
            await passTime(diff);
        curTime = time;

        matrix[parseInt(colS, 10)][parseInt(rowS, 10)]!.state = stateS === 'true';
        await settleForks();
    }
    await settleForks();

    if (process.env.NODE_ENV !== 'test')
        await setTime(undefined);
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