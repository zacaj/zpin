import * as readline from 'readline-sync';
import { Solenoid16 } from './boards';
import { MPU } from './mpu';
import { Events } from './events';
import { SwitchEvent, matrix } from './switch-matrix';
import { Game } from './game';
import { StateEvent } from './state';
import * as fs from 'fs';
import { safeSetTimeout } from './timer';

const argv = require('yargs').argv;

console.log('Initializing....');
MPU.init(argv.ip).then(async () => {
const board = new Solenoid16(0);
//await board.init();

if (argv.s || argv.source) {
    await source(argv.s || argv.source);
}

console.log('ready:');

//const game = new Game();
//game.rampUp = !game.rampUp;


while (true) {
    try {
        const cmd = readline.question('>');
        await parseCommand(cmd);
    } catch (e) {
        console.error(e);
    }
}

async function parseCommand(input: string) {
    const cmd = input.split(' ');
    let result: Promise<any>;
    switch (cmd[0]) {
        // case 'fakesw':
        //     // Events.fire(new StateEvent());
        //     Events.fire(new SwitchEvent(matrix[0][0]));
        //     result = Promise.resolve('fired');
        //     break;
        case 'wait':
            result = new Promise(r => safeSetTimeout(r, num(cmd[1])));
            break;
        case 'source':
            result = source(cmd[1]);
            break;
        case 'f':
            if (cmd.length >= 2)
                result = board.fireSolenoidFor(num(cmd[1]), num(cmd[2]));
            else
                result = board.fireSolenoid(num(cmd[1]));
            break;
        case 'on':
            result = board.turnOnSolenoid(num(cmd[1]));
            break;
        case 'off':
            result = board.turnOffSolenoid(num(cmd[1]));
            break;
        case 'i':
            switch (cmd[1]) {
                case 'm':
                    result = board.initMomentary(num(cmd[2]), cmd.length > 3 ? num(cmd[3]) : undefined);
                    break;
                case 'oo':
                    result = board.initOnOff(num(cmd[2]), cmd.length > 3 ? num(cmd[3]) : undefined);
                    break;
                case 'i':
                    result = board.initInput(num(cmd[2]), cmd.length > 3 ? num(cmd[3]) : undefined);
                    break;
                case 't':
                    result = board.initTriggered(num(cmd[2]), num(cmd[3]), cmd.length > 4 ? num(cmd[4]) : undefined, cmd.length > 5 ? num(cmd[5]) : undefined);
                    break;
                default:
                    throw `unknown type ${cmd[1]}`;
            }
            break;
        case 'fl':
            await board.initTriggered(num(cmd[1]), num(cmd[2]), 0, 0);
            await board.initInput(num(cmd[2]), 0);
            result = Promise.resolve('intialized');
            break;
        case 'd':
            result = board.disableSolenoid(num(cmd[1]));
            break;
        default:
            throw `unknown command ${cmd[0]}`;
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

function num(str: string): number {
    const num = Number.parseInt(str, 10);
    if (isNaN(num)) {
        throw `cannot parse number '${str}'`;
    }
    if (num < 0)
        throw `number ${num} out of valid range`;
    return num;
}