import { Log } from './log';
import { Timer, passTime } from './timer';
import * as fs from 'fs';
import { split } from './util';
import { matrix } from './switch-matrix';
import { settleForks } from './promises';

export let curRecording: string|undefined = undefined;

export function initRecording(recording: string) {
    curRecording = recording;
    Log.log(['console'], 'playing back recording %s', recording);
    Timer.mockTime = 0;
}

export async function playRecording() {
    const file = fs.readFileSync(curRecording!, 'utf8');
    const lines = file.split('\n');
    let curTime = 0;
    for (const line of lines) {
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

    Timer.mockTime = undefined;
    curRecording = undefined;
}

