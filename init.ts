import { MPU } from './mpu';
import { machine, resetMachine } from './machine';
import { resetSwitchMatrix } from './switch-matrix';
import { Events } from './events';
import { Log } from './log';

const argv = require('yargs').argv;

export async function initMachine() {
    Log.init();
    Log.log(['console'], 'Initializing....');
    resetSwitchMatrix();
    resetMachine();
    await MPU.init(argv.ip);
    
    await machine.initOutputs();
}