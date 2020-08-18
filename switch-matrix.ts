import { MPU } from './mpu';
import { split, nums, JSONValue, clone, assert, selectiveClone, getCallerLoc } from './util';
import { Event, Events, EventPredicate, EventTypePredicate, onAny } from './events';
import { State } from './state';
import { Time, time, safeSetInterval } from './timer';
import { Log } from './log';
import { machine } from './machine';

export const Standup = [0,50];
export const Drop = [10, 150];
export const Bumper = [0, 25];
export const Lane = [1, 10];
export const Hole = [25, 25];
export const Drain = [500, 250];

export class Switch {
    _state = false;
    get state() {
        return this._state;
    }
    set state(val: boolean) {
        this.changeState(val, getCallerLoc(true));
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
    minOnTime!: number;

    constructor(
        public readonly row: number,
        public readonly column: number,
        public readonly name = `${row},${column}`,
        minOnTime: number[]|number = 1,
        public minOffTime = 1,
    ) {
        State.declare<Switch>(this, ['_state', 'lastChange', 'lastClosed', 'lastOpened']);
        if (Array.isArray(minOnTime)) {
            this.minOnTime = minOnTime[0];
            this.minOffTime = minOnTime[1];
        }

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

    changeState(val: boolean, source: string, when = time()): SwitchEvent|undefined {
        if (this._state === val) return undefined;
        Log.info('switch', 'switch \'%s\' state -> %s (%i,%i) at %i via %s', this.name, val, this.column, this.row, when, source);
        this.lastChange = when;
        if (val)
            this.lastClosed = time();
        else
            this.lastOpened = time();
        this._state = val;
        const event = new SwitchEvent(this, when);
        Events.fire(event);
        return event;
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

    cleanLog() {
        return selectiveClone(this, 'name', '_state', 'row', 'column');
    }
}


export class SwitchEvent extends Event {
    _desc!: string;
    then: Switch; //Pick<Switch, Extract<keyof Switch, JSONValue>>;//{ [P in keyof Switch]: Switch[P] };
    constructor(
        public sw: Switch,
        public when = time(),
    ) {
        super(when);

        this.then = clone(sw);
        this._desc = `sw ${sw.name} ${sw.state? 'closed' : 'opened'}`;
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
export function onAnyPfSwitchExcept(...sw: Switch[]): EventTypePredicate<SwitchEvent>[] {
    return [onClose(), e => !sw.includes(e.sw) && machine.pfSwitches.includes(e.sw)];
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

let lastEventCheck = 0;
let lastSwitchEvent = 0;
let lastRawCheck = 0;
safeSetInterval(async () => {
    if (!MPU.isConnected) return;

    const start = time();
    const events = await getSwitchEvents();
    for (const resp of events) {
        assert(resp.when > lastSwitchEvent);
        lastEventCheck = resp.when;
        const ago = time() - resp.when;
        if (ago > (start - lastEventCheck)*2 || resp.when < lastRawCheck) {
            Log.info(['switch'], 'ignore switch event %j, %i late', resp, ago - (start - lastEventCheck)*2);
        }
        else {
          if (matrix[resp.col][resp.row])
               matrix[resp.col][resp.row]!.changeState(resp.state, 'event', resp.when);
          else if (resp.state)
               console.warn('got event for unregistered switch ', resp);
        }
    }
    lastEventCheck = start;

    if (time() - lastRawCheck > 1000) {
        const newState = await getSwitchState();
        forRC((r,c,sw) => {
            assert(sw.state === newState[r][c]);
        });
        lastRawCheck = time();
    }
}, 1, 'switch check');

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

export async function getSwitchEvents(): Promise<{
    row: number;
    col: number;
    when: Time;
    state: boolean;
}[]> {
    const resp = await MPU.sendCommandCode('sw'); // row+","+col+"="+state+"@"+when
    if (resp.resp === 'empty') return [];
    const events = resp.resp.split(';');
    return events.map(line => {
        const [rows, cols, state, when] = split(line, ',', '->', ' @');
        const [row, col] = nums([rows, cols]);
        return {
            row, col,
            state: state === 'true',
            when: MPU.adjust(when),
        };
    });
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