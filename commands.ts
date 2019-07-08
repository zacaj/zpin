import * as rpio from 'rpio';
import { LOW, OUTPUT, INPUT, HIGH, PULL_OFF, write, read } from 'rpio';

export const apiRevision = 1;
export enum Pin {
	SS0 = 12,
	SS1 = 16,
	SS2 = 18,
	SSDI = 35,
	SSDO = 38,
	SCLK = 40,
};

export function init() {
	const outputs = [
		Pin.SS0,
		Pin.SS1,
		Pin.SS2,
		Pin.SSDO,
		Pin.SCLK,
	];
	for (const output of outputs) {
		rpio.open(output, OUTPUT, LOW);
	}

	const inputs = [
		Pin.SSDI,
	];
	for (const input of inputs) {
		rpio.open(input, INPUT, PULL_OFF);
	}
}

function select(i: number) {
	write(Pin.SS1, i & (1 << 1));
	write(Pin.SS2, i & (1 << 2));
	write(Pin.SS0, i & (1 << 0));
}

function spiWrite(...data: number[]) {
	for (const byte of data) {
		for (let i=0; i<8; i++) {
			write(Pin.SCLK, LOW);
			write(Pin.SSDO, byte & (1<<i)? HIGH : LOW);
			write(Pin.SCLK, HIGH);
		}
	}
	write(Pin.SCLK, LOW);
}
function spiRead(bytes: number): number[] {
	const data: number[] = [];
	write(Pin.SCLK, LOW);
	for (let b=0; b<bytes; b++) {
		let byte = 0;
		for (let i=0; i<8; i++) {
			write(Pin.SCLK, HIGH);
			byte |= (read(Pin.SSDI)? 1:0) << i;
			write(Pin.SCLK, LOW);
		}
		data.push(byte);
	}
	return data;
}


export enum BoardType {
	Solenoid16 = 5,
}
export function identify(board: number): {
	type: BoardType,
	hwRevision: number,
	apiRevision: number,
} {
	select(board);
	spiWrite(0b11111110);
	const id = spiRead(2);
	return {
		type: id[0] & 0b11111,
		hwRevision: (id[0] & 0b11110000) >> 4,
		apiRevision: id[1],
	};
}

function i4(i: number): number[] {
	return [
		(i >> 0) & 0xFF,
		(i >> 8) & 0xFF,
		(i >> 16) & 0xFF,
		(i >> 24) & 0xFF,
	]
}

enum SolenoidMode {
	Disabled = 0,
    Input = 1,
    Momentary = 2,
    OnOff = 3,
    Triggered = 4,
}
export class Solenoid16 {
	constructor(
		public board: number
	) {
		const { type, apiRevision: apiRev} = identify(board);
		if (type !== BoardType.Solenoid16)
			throw `wrong board type ${type}`;
		if (apiRev !== apiRevision)
			throw `wrong api revision ${apiRev}`;

		for (let i=0; i<16; i++) {
			this.disableSolenoid(i+1);
		}
	}

	startCommand(num: number, cmd: number) {
		select(this.board);
		spiWrite((num - 1) << 4 | cmd);
	}
	
	fireSolenoid(num: number) {
		this.startCommand(num, 0);
	}

	disableSolenoid(num: number) {
		this.startCommand(num, 0b0110);
		spiWrite(SolenoidMode.Disabled);
		spiWrite(...i4(0));
	}

	initMomentary(num: number, onTime = 50) {
		this.startCommand(num, 0b0110);
		spiWrite(
			SolenoidMode.Momentary,
			...i4(0),
			...i4(onTime)
		);
	}
}


