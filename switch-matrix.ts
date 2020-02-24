import { MPU } from './mpu';
import assert from 'assert';
import { time, Time, split, nums, JSONValue } from './util';
import { Event, Events, EventPredicate, EventTypePredicate } from './events';
export class Switch {
    _state = false;
    get state() {
        return this._state;
    }
    set state(val: boolean) {
        this.changeState(val);
    }
    lastChange = 0 as Time;

    constructor(
        public row: number,
        public column: number,
        public name = `${row},${column}`,
    ) {
    }

    changeState(val: boolean, when = time()) {
        if (this._state === val) return;
        this._state = val;
        this.lastChange = when;
        console.info('switch %s state -> %s', this.name, this._state);
        Events.fire(new SwitchEvent(this, when));
    }
}

export class SwitchEvent extends Event {
    then: Switch; //Pick<Switch, Extract<keyof Switch, JSONValue>>;//{ [P in keyof Switch]: Switch[P] };
    constructor(
        public sw: Switch,
        public when = time(),
    ) {
        super(when);

        this.then = Object.assign({}, sw);
    }
}

export function onSwitch(sw: Switch): EventTypePredicate<SwitchEvent> {
    return e => e instanceof SwitchEvent && e.sw === sw;
}

export function onClose(): EventTypePredicate<SwitchEvent> {
    return e => e instanceof SwitchEvent && e.then._state;
}

export function onSwitchClose(sw: Switch): EventTypePredicate<SwitchEvent>[] {
    return [onSwitch(sw), onClose()];
}

export const SWITCH_MATRIX_WIDTH = 8;
export const SWITCH_MATRIX_HEIGHT = 8;

export const matrix: Switch[][] = []; // row,col
for (let i=0; i<SWITCH_MATRIX_HEIGHT; i++) {
    const row: Switch[] = [];
    for (let j=0; j<SWITCH_MATRIX_WIDTH; j++)
        row.push(new Switch(i, j));
    matrix.push(row);
}

setInterval(async () => {
    if (!MPU.isConnected) return;

    const start = time();
    while (time() - start < 5) {
        const resp = await getSwitchEvent();
        if (!resp || !resp.more) break;
        matrix[resp.row][resp.col].changeState(resp.state, resp.when);
    }

    const newState = await getSwitchState();
    forRC((r,c,sw) => {
        sw.state = newState[r][c];
    });
}, 1000/60);

export function forRC(cb: (row: number, column: number, sw: Switch) => void) {
    for (let i=0; i<SWITCH_MATRIX_HEIGHT; i++)
        for (let j=0; j<SWITCH_MATRIX_WIDTH; j++)
            cb(i, j, matrix[i][j]);
}

export async function getSwitchEvent(): Promise<{
    row: number;
    col: number;
    when: Time;
    state: boolean;
    more: boolean;
}|null> {
    const resp = await MPU.sendCommandCode('sw'); // row+","+col+"="+state+"@"+when
    if (resp.resp === 'empty') return null;
    const [rows, cols, state, when] = split(resp.resp, ',', '=', '@');
    const [row, col] = nums([rows, cols]);
    return {
        row, col,
        state: state === 'true',
        when: MPU.adjust(when),
        more: resp.code === 201,
    };
}

export async function getSwitchState(): Promise<boolean[][]> {
    const encoded = await MPU.sendCommand('sw-state');
    const state: boolean[][] = [];
    let row: boolean[] = [];
    const ints = encoded.split(' ').map(s => parseInt(s, 10));
    for (let int of ints) {
        for (let i=0; i<32; i++) {
            const sw = int&(1<<31);
            int = int << 1;
            row.push(!!sw);
            if (row.length === SWITCH_MATRIX_WIDTH) {
                state.push(row);
                row = [];
            }
        }
    }

    //assert(state.length === SWITCH_MATRIX_HEIGHT);
    if (state.length !== SWITCH_MATRIX_HEIGHT)
        console.error('got non-square matrix');

    return state;
}