/* eslint-disable @typescript-eslint/no-floating-promises */
import { MPU } from './mpu';
import { machine, resetMachine } from './machine';
import { resetSwitchMatrix } from './switch-matrix';
import { Events } from './events';
import { Log } from './log';
import { initGfx } from './gfx';
import { Game } from './game';

const argv = require('yargs').argv;

export async function initMachine(mpu = true, gfx = false, game = false) {
    if (argv.mpu !== undefined) mpu = argv.mpu;
    if (argv.gfx !== undefined) gfx = argv.mpu;
    if (argv.game !== undefined) game = argv.mpu;
    Log.init();
    Log.log(['console'], 'Initializing....');
    Events.resetAll();
    resetSwitchMatrix();
    resetMachine();
    if (mpu) {
        await MPU.init(argv.ip);
    
        await machine.initOutputs();
    }

    if (gfx)
        await initGfx();
    if (game)
        Game.start();
}


if (require.main === module) {
    initMachine(!!argv.mpu, !!argv.gfx, !!argv.game);
}