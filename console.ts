import * as readline from 'readline-sync';
import { Solenoid16 } from './boards';
import { MPU } from './mpu';
import { Events } from './events';
import { SwitchEvent, matrix } from './switch-matrix';
import { Game } from './game';
import { StateEvent } from './state';

console.log('Initializing....');
MPU.init().then(async () => {
const board = new Solenoid16(0);
//await board.init();

console.log('ready:');

const game = new Game();

while(true) {
	try {
		const cmd = readline.question('>').split(' ');
		let result: Promise<any>;
		switch (cmd[0]) {
			case 'fakesw':
				// Events.fire(new StateEvent());
				Events.fire(new SwitchEvent(matrix[0][0]));
				result = Promise.resolve('fired');
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
				result = board.initTriggered(num(cmd[1]), num(cmd[2]), 0, 0);
				board.initInput(num(cmd[2]), 0);
				break;
			case 'd':
				result = board.disableSolenoid(num(cmd[1]));
				break;
			default:
				throw `unknown command ${cmd[0]}`;
		}

		console.log(await result);
	} catch (e) {
		console.error(e);
	}
}
})
.catch(err => {
	console.error('fatal error ', err);
	process.exit(1);
});

function num(str: string): number {
	const num = Number.parseInt(str);
	if (isNaN(num)) {
		throw `cannot parse number '${str}'`;
	}
	if (num < 0)
		throw `number ${num} out of valid range`;
	return num;
}