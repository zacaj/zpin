import { MPU } from './mpu';
import { split, nums, JSONValue, clone, assert } from './util';
import { Event, Events, EventPredicate, EventTypePredicate, onAny } from './events';
import { State } from './state';
import { Time, time, safeSetInterval } from './timer';
import { Log } from './log';
export class Switch {
    _state = false;
    get state() {
        return this._state;
    }
    set state(val: boolean) {
        this.changeState(val);
    }
    lastChange = 0 as Time;
    get lastOn(): Time|undefined {
        if (this.state) return time();
        return this.lastOpened;
    }
    get lastOff(): Time|undefined {
        if (!this.state) return time();
        return this.lastClosed;
    }
    lastClosed?: Time;
    lastOpened?: Time;

    constructor(
        public readonly row: number,
        public readonly column: number,
        public readonly name = `${row},${column}`,
        public minOnTime = 1,
        public minOffTime = 1,
) {
        State.declare<Switch>(this, ['_state', 'lastChange', 'lastClosed', 'lastOpened']);

        const m = matrix;
        assert(!matrix[column][row]);
        matrix[column][row] = this;
    }

    async init() {
        if (this.minOffTime !== 1 || this.minOnTime !== 1) {
            Log.info('switch', 'set %s settle to %i/%i', this.name, this.minOnTime, this.minOffTime);
            await MPU.sendCommand(`sw-config ${this.row} ${this.column} ${this.minOnTime} ${this.minOffTime}`);
        }
    }

    changeState(val: boolean, when = time()) {
        if (this._state === val) return;
        this.lastChange = when;
        if (val)
            this.lastClosed = time();
        else
            this.lastOpened = time();
        this._state = val;
        Log.info('switch', 'switch \'%s\' state -> %s (%i,%i)', this.name, this._state, this.column, this.row);
        Events.fire(new SwitchEvent(this, when));
    }

    onFor(ms: number): boolean {
        return this.state && time()-this.lastChange >= ms;
    }

    offFor(ms: number): boolean {
        return !this.state && time()-this.lastChange >= ms;
    }

    wasClosedWithin(ms: number): boolean {
        return this.state || (!!this.lastClosed && time() - this.lastClosed <= ms);
    }

    openForAtLeast(ms: number): boolean {
        return !this.state && (!this.lastOn || time() - this.lastOn > ms);
    }
}


export class SwitchEvent extends Event {
    then: Switch; //Pick<Switch, Extract<keyof Switch, JSONValue>>;//{ [P in keyof Switch]: Switch[P] };
    constructor(
        public sw: Switch,
        public when = time(),
    ) {
        super(when);

        this.then = clone(sw);
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

export function onAnySwitchClose(...sw: Switch[]): EventTypePredicate<SwitchEvent> {
    return onAny(...sw.map(s => onSwitchClose(s)));
}
export function onAnySwitchExcept(...sw: Switch[]): EventTypePredicate<SwitchEvent>[] {
    return [onClose(), e => !sw.includes(e.sw)];
}

export const SWITCH_MATRIX_WIDTH = 16;
export const SWITCH_MATRIX_HEIGHT = 8;

export const matrix: (Switch|undefined)[][] = []; // row,col
for (let i=0; i<SWITCH_MATRIX_WIDTH; i++) {
    const row: (Switch|undefined)[] = [];
    for (let j=0; j<SWITCH_MATRIX_HEIGHT; j++)
        row.push(undefined);
    matrix.push(row);
}

export function resetSwitchMatrix() {
    for (let i=0; i<SWITCH_MATRIX_HEIGHT; i++)
        for (let j=0; j<SWITCH_MATRIX_WIDTH; j++)
            matrix[j][i] = undefined;
}

safeSetInterval(async () => {
    if (!MPU.isConnected) return;

    const start = time();
    while (time() - start < 5) {
        const resp = await getSwitchEvent();
        if (!resp || !resp.more || time() - resp.when > 1000/60*2) break;
        if (matrix[resp.col][resp.row])
            matrix[resp.col][resp.row]!.changeState(resp.state, resp.when);
        else if (resp.state)
            console.warn('got event for unregistered switch ', resp);
    }

    const newState = await getSwitchState();
    forRC((r,c,sw) => {
        sw.state = newState[r][c];
    });
}, 1000/60, 'switch check');

export function forRC(cb: (row: number, column: number, sw: Switch) => void) {
    for (let i=0; i<SWITCH_MATRIX_HEIGHT; i++)
        for (let j=0; j<SWITCH_MATRIX_WIDTH; j++)
            if (matrix[j][i])
                cb(i, j, matrix[j][i]!);
}

export function getSwitchByName(name: string): Switch|undefined {
    for (let i=0; i<SWITCH_MATRIX_HEIGHT; i++)
        for (let j=0; j<SWITCH_MATRIX_WIDTH; j++)
            if (matrix[j][i] && matrix[j][i]?.name === name)
                return matrix[j][i];
    return undefined;
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
    assert(state.length === SWITCH_MATRIX_HEIGHT);

    return state;
}