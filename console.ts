import * as readline from 'readline-sync';
import { Solenoid16 } from './commands';

console.log('Initializing....');

const board = new Solenoid16(3);

console.log('ready');

while(true) {
	try {
		const cmd = readline.question('>').split(' ');
		switch (cmd[0]) {
			case 'f':
				board.fireSolenoid(num(cmd[1]));
				break;
			case 'i':
				switch (cmd[1]) {
					case 'm':
						board.initMomentary(num(cmd[2]), cmd.length > 3 ? num(cmd[3]) : undefined);
						break;
					default:
						throw `unknown type ${cmd[1]}`;
				}
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
	return num;
}