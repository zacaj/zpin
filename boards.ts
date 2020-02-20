import { MPU } from "./mpu";

export class Solenoid16 {
	constructor(
		public board: number
	) {
		
	}

	init() {
		return MPU.sendCommand(`i ${this.board} s16`);
	}

	send(cmd: string) {
		return MPU.sendCommand(`${this.board}: ${cmd}`);
	}

	fireSolenoid(num: number) {
		return this.send(`f ${num}`);
	}

	turnOnSolenoid(num: number) {
		return this.send(`on ${num}`);
	}

	turnOffSolenoid(num: number) {
		return this.send(`off ${num}`);
	}

	fireSolenoidFor(num: number, onTime: number) {
		return this.send(`f ${num} ${onTime}`);
	}

	disableSolenoid(num: number) {
		return this.send(`d ${num}`);
	}

	initMomentary(num: number, onTime = 50) {
		return this.send(`is m ${num} ${onTime}`);
	}

	initOnOff(num: number, maxOnTime = 0) {
		return this.send(`is oo ${num} ${maxOnTime}`);
	}

	initInput(num: number, settleTime = 3) {
		return this.send(`is i ${num} ${settleTime}`);
	}

	initTriggered(num: number, triggeredBy: number, minOnTime = 0, maxOnTime = 50) {
		return this.send(`is t ${num} ${triggeredBy} ${minOnTime} ${maxOnTime}`);
	}
}
