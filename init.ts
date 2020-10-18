/* eslint-disable @typescript-eslint/no-floating-promises */
import { MPU } from './mpu';
import { machine, resetMachine } from './machine';
import { resetSwitchMatrix } from './switch-matrix';
import { Events } from './events';
import { Log } from './log';
import { initGfx } from './gfx';
import { Game } from './game';
import { initRecording, playRecording } from './recording';
import { wait } from './timer';
import { initAudio } from './sound';

const argv = require('yargs').argv;

export async function initMachine(mpu = true, gfx = false, game = false, trace = true, recording?: string, toPoint?: string) {
    try {
        if (argv.mpu !== undefined) mpu = argv.mpu;
        if (argv.gfx !== undefined) gfx = argv.gfx;
        if (argv.game !== undefined) game = argv.game;
        if (argv.trace !== undefined) trace = argv.trace;
        if (argv.recording !== undefined) recording = argv.recording;
        const sound = argv.sound ?? mpu;
        Log.init(trace);
        Log.log(['console'], 'Initializing....');
        Events.resetAll();
        resetSwitchMatrix();
        resetMachine();
        if (recording) {
            initRecording(recording);
        }
        if (mpu) {
            await MPU.init(argv.ip);
        
            await machine.initOutputs();
        }

        if (sound)
            await initAudio();
        if (gfx)
            await initGfx();
        if (game)
            Game.start();
        if (recording) {
            await new Promise(r => setTimeout(r, 100));
            await playRecording(toPoint);
        }
    } catch (err) {
        console.error('init error', err);
        debugger;
    }
}


if (require.main === module) {
    initMachine(!!argv.mpu, !!argv.gfx, !!argv.game);
}