import { MPU } from './mpu';
import { machine, resetMachine } from './machine';
import { resetSwitchMatrix } from './switch-matrix';
import { Events } from './events';

const argv = require('yargs').argv;

export async function initMachine() {
    console.log('Initializing....');
    await MPU.init(argv.ip);
    
    await machine.initOutputs();
}