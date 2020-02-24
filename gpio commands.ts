import * as rpio from 'rpio';
// import { init as rpioInit, open as rpioOpen, LOW, OUTPUT, INPUT, HIGH, PULL_OFF, write, read } from 'rpio';

export const apiRevision = 1;
export enum Pin {
    SS0 = 12,
    SS1 = 16,
    SS2 = 18,
    SSDI = 35,
    SSDO = 38,
    SCLK = 40,
}

export function init() {
    rpio.init({
        gpiomem: true,          /* Use /dev/gpiomem */
        mapping: 'physical',    /* Use the P1-P40 numbering scheme */
        // mock: undefined,        /* Emulate specific hardware in mock mode */
    });

    const outputs = [
        Pin.SS0,
        Pin.SS1,
        Pin.SS2,
        Pin.SSDO,
        Pin.SCLK,
    ];
    for (const output of outputs) {
        rpio.open(output, rpio.OUTPUT, rpio.LOW);
    }

    const inputs = [
        Pin.SSDI,
    ];
    for (const input of inputs) {
        rpio.open(input, rpio.INPUT, rpio.PULL_OFF);
    }
}

function select(i: number) {
    rpio.write(Pin.SS1, 0);//!(i & (1 << 1)));
    rpio.write(Pin.SS2, i & (1 << 2));
    rpio.write(Pin.SS0, i & (1 << 0));
}

function spiWrite(...data: number[]) {
    for (const byte of data) {
        for (let i=7; i>=0; i--) {
            rpio.write(Pin.SCLK, rpio.LOW);
            rpio.write(Pin.SSDO, byte & (1<<i)? rpio.HIGH : rpio.LOW);
            rpio.write(Pin.SCLK, rpio.HIGH);
        }
        console.log('write byte ', byte);
    }
    rpio.write(Pin.SCLK, rpio.LOW);
}
function spiRead(bytes: number): number[] {
    const data: number[] = [];
    rpio.write(Pin.SCLK, rpio.LOW);

    for (let b=0; b<bytes; b++) {
        let byte = 0;
        for (let i=7; i>=0; i--) {
            rpio.write(Pin.SCLK, rpio.HIGH);
            byte |= (rpio.read(Pin.SSDI)? 1:0) << i;
            rpio.write(Pin.SCLK, rpio.LOW);
        }
        console.log('read byte ', byte, b);
        data.push(byte);
    }
    return data;
}
function sendCommand(...bytes: number[]): number[] {
    spiWrite(
        'S'.charCodeAt(0),
        bytes.length,
        ...bytes,
        bytes.reduce((prev, val) => prev + val, 0) & 0xFF,
        'E'.charCodeAt(0),
    );
    let ready = 0;
    rpio.write(Pin.SCLK, rpio.LOW);
    while (ready !== 'R'.charCodeAt(0)) {
        rpio.write(Pin.SCLK, rpio.HIGH);
        ready <<= (rpio.read(Pin.SSDI)? 1:0);
        rpio.write(Pin.SCLK, rpio.LOW);
        if (ready === 'L'.charCodeAt(0)) {
            throw `sent wrong length command (${bytes.length}), board wanted ${spiRead(1)[0]}`;
        }
        if (ready === 'C'.charCodeAt(0)) {
            throw 'checksum fail from board';
        }
    }
    const numInputBytes = spiRead(1)[0];
    if (numInputBytes > 0) {
        const inputBytes = spiRead(numInputBytes+1);
        const input = inputBytes.slice(0, inputBytes.length - 1);
        const sum = input.slice(0, input.length - 1).reduce((prev, val) => prev + val, 0) & 0xFF;
        if (sum !== inputBytes[inputBytes.length - 1])
            throw `checksum fail, input ${inputBytes[inputBytes.length - 1]} != ${sum} for bytes ${input}`;
            return input;
    }
    return [];
}

export enum BoardType {
    Solenoid16 = 5,
}
export function identify(board: number): {
    type: BoardType;
    hwRevision: number;
    apiRevision: number;
} {
    select(board);
    const id = sendCommand(
        0b11111110,
    );
    if (id.length !== 2)
        throw `got wrong identify message back (length ${id.length})`;
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
    ];
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
        public board: number,
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

    startCommand(num: number, cmd: number): number {
        select(this.board);
        return cmd << 4 | (num - 1);
    }

    fireSolenoid(num: number) {
        sendCommand(
            this.startCommand(num, 0),
        );
    }

    fireSolenoidFor(num: number, onTime: number) {
        sendCommand(
            this.startCommand(num, 0b0001),
            onTime,
        );
    }

    disableSolenoid(num: number) {
        sendCommand(
            this.startCommand(num, 0b0110),
            SolenoidMode.Disabled,
            ...i4(0),
        );
    }

    initMomentary(num: number, onTime = 50) {
        sendCommand(
            this.startCommand(num, 0b0110),
            SolenoidMode.Momentary,
            ...i4(0),
            ...i4(onTime),
        );
    }

    initInput(num: number, settleTime = 3) {
        sendCommand(
            this.startCommand(num, 0b0110),
            SolenoidMode.Input,
            ...i4(0),
            settleTime,
        );
    }

    initTriggered(num: number, triggeredBy: number, minOnTime = 0, maxOnTime = 50) {
        sendCommand(
            this.startCommand(num, 0b0110),
            SolenoidMode.Input,
            ...i4(0),
            triggeredBy - 1,
            ...i4(minOnTime),
            ...i4(maxOnTime),
        );
    }
}


