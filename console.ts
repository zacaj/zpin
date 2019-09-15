import * as readline from 'readline-sync';
import { Solenoid16, init } from './commands';

console.log('Initializing....');
init();
const board = new Solenoid16(0b010);

console.log('ready');

while(true) {
	try {
		const cmd = readline.question('>').split(' ');
		switch (cmd[0]) {
			case 'f':
				if (cmd.length >= 2)
					board.fireSolenoidFor(num(cmd[1]), num(cmd[2]));
				else
					board.fireSolenoid(num(cmd[1]));
				break;
			case 'i':
				switch (cmd[1]) {
					case 'm':
						board.initMomentary(num(cmd[2]), cmd.length > 3 ? num(cmd[3]) : undefined);
						break;
					case 'i':
						board.initInput(num(cmd[2]), cmd.length > 3 ? num(cmd[3]) : undefined);
						break;
					case 't':
						board.initTriggered(num(cmd[2]), num(cmd[3]), cmd.length > 4 ? num(cmd[4]) : undefined, cmd.length > 5 ? num(cmd[5]) : undefined);
						break;
					default:
						throw `unknown type ${cmd[1]}`;
				}
				break;
			case 'fl':
				board.initTriggered(num(cmd[1]), num(cmd[2]), 0, 0);
				board.initInput(num(cmd[2]), 0);
				break;
			case 'd':
				board.disableSolenoid(num(cmd[1]));
				break;
			default:
				throw `unknown command ${cmd[0]}`;
		}
	} catch (e) {
		console.error(e);
	}
}

function num(str: string): number {
	const num = Number.parseInt(str);
	if (isNaN(num)) {
		throw `cannot parse number '${str}'`;
	}
	if (num < 0)
		throw `number ${num} out of valid range`;
	return num;
}