import { Solenoid16 } from './boards';
import { MPU } from './mpu';
import { SwitchEvent, matrix } from './switch-matrix';
import * as fs from 'fs';
import * as readline from 'readline';
require('./machine');
import { safeSetTimeout, wait } from './timer';
import { machine, MomentarySolenoid, OnOffSolenoid } from './machine';
import { num } from './util';
import { initMachine } from './init';

const argv = require('yargs').argv;

initMachine().then(async () => {

if (argv.s || argv.source) {
    await source(argv.s || argv.source);
}

console.log('ready:');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

while (true) {
    try {
        const cmd: string = await new Promise(r => rl.question('>', r));
        await parseCommand(cmd);
    } catch (e) {
        console.error(e);
    }
}

function getCoil(str: string): OnOffSolenoid|MomentarySolenoid {
    const name = str.toLowerCase().replace(/ /g, '');
    const b = str[0] === 'a'? machine.solenoidBank1 : machine.solenoidBank2;
    const n = num(str.slice(1), -1);
    for (const key of Object.keys(machine)) {
        if (!key.startsWith('c')) continue;
        const coil = (machine as any)[key] as OnOffSolenoid|MomentarySolenoid;
        if ((key.toLowerCase().slice(1) === name) ||
            (coil.board === b && coil.num === n)
        ) {
            return coil;
        }
    }
    throw `coil '${str}' not recognized`;
}

// eslint-disable-next-line complexity
async function parseCommand(input: string) {
    let result: Promise<any>;
    if (input.startsWith('$')) {
        result = MPU.sendCommand(input.slice(1));
    } else {
        const cmd = input.split(' ');
        switch (cmd[0]) {
            // case 'fakesw':
            //     // Events.fire(new StateEvent());
            //     Events.fire(new SwitchEvent(matrix[0][0]));
            //     result = Promise.resolve('fired');
            //     break;
            case 'sw-state': 
                result = Promise.resolve(matrix.flatMap(row => row.flatMap(cell => cell?.state? 'X':'.').join('')).join('\n'));
                break;
            case 'wait':
                result = wait(num(cmd[1]), 'user wait').then(() => 'done');
                break;
            case 's':
            case 'source':
                result = source(cmd[1]);
                break;
            case 'f': {
                const ms = cmd.length > 2? num(cmd[2]):undefined;
                const coil = getCoil(cmd[1]);
                if (coil instanceof MomentarySolenoid)
                    result = coil.fire(ms);
                else
                    throw 'coil is not momentary';
                break;
            }
            case 'on': {
                const coil = getCoil(cmd[1]);
                if (coil instanceof OnOffSolenoid)
                    result = coil.set(true);
                else
                    throw 'coil is not on-off';
                break;
            }
            case 'off': {
                const coil = getCoil(cmd[1]);
                if (coil instanceof OnOffSolenoid)
                    result = coil.set(false);
                else
                    throw 'coil is not on-off';
                break;
            }
            case 't':
            case 'toggle': {
                const coil = getCoil(cmd[1]);
                if (coil instanceof OnOffSolenoid)
                    result = coil.toggle();
                else
                    throw 'coil is not on-off';
                break;
            }
            default:
                throw `unknown command ${cmd[0]}`;
        }
    }

    console.log(await result);
}

async function source(path: string) {
    const lines = fs.readFileSync(path).toString().split('\n');
    for (const line of lines) {
        await parseCommand(line);
    }
}
})
.catch(err => {
    console.error('fatal error ', err);
    process.exit(1);
});
