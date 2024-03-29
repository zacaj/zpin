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
import { AttractMode } from './attract';
import { CPU } from './cpu';
import { fork } from './promises';
import { LPU } from './light';

const argv = require('yargs').argv;

export let initialized = false;

// eslint-disable-next-line complexity
export async function initMachine(mpu = true, gfx = false, game = false, trace = true, recording?: string, toPoint?: string) {
    try {
        initialized = false;
        if (argv.mpu !== undefined) mpu = argv.mpu;
        if (argv.gfx !== undefined) gfx = argv.gfx;
        if (argv.game !== undefined) game = argv.game;
        if (argv.trace !== undefined) trace = argv.trace;
        if (argv.recording !== undefined) recording = argv.recording;
        const cpu = argv.cpu ?? false;
        const lights = argv.lpu ?? argv.mpu ?? false;
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

        if (!MPU.isLive)
            machine.sDetect3.changeState(true, 'fake');
            
        if (cpu) {
            fork(CPU.init(argv.cpuIp ?? argv.ip));
        }

        if (sound)
            await initAudio();
        if (gfx)
            await initGfx();
        if (lights)
            await LPU.init(argv.lightIp);
        initialized = true;
        if (game)
            Game.start();
        else
            AttractMode.start();
        if (recording) {
            await new Promise(r => setTimeout(r, 100));
            await playRecording(toPoint);
        }
    } catch (err) {
        console.error('init error', err);
        debugger;
    }
}

process.on('unhandledRejection', (err, promise) => {
    Log.error(['console', 'machine'], 'Unhandled rejection (promise: ', promise, ', reason: ', err, ').');
});


if (require.main === module) {
    initMachine(!!argv.mpu, !!argv.gfx, !!argv.game);
}