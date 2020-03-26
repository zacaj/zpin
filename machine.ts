import { State, Tree } from './state';
import { Solenoid16 } from './boards';
import { matrix, Switch } from './switch-matrix';
import { Time, time } from './util';
import { Events } from './events';
import { Mode } from './mode';
import { Outputs, TreeOutputEvent, OwnOutputEvent } from './outputs';

abstract class MachineOutput<T> {
    actual!: T;

    constructor(
        public val: T,
        public name: keyof MachineOutputs,
    ) {
        this.actual = val;
        Events.listen<TreeOutputEvent<any>>(ev => this.trySet(ev.value),
            ev => ev instanceof TreeOutputEvent && ev.tree === machine && ev.prop === name);
    }

    async trySet(val: T) {
        try {
            this.val = val;
            if (this.actual === val) return;
            const success = await this.set(val);
            if (!success) MachineOutput.retryQueue.push([this, val]);
            this.actual = val;
        } catch (err) {
            console.error('error setting output %s to ', this.name, val, err);
            MachineOutput.retryQueue.push([this, val]);
        }
    }

    static retryQueue: [MachineOutput<any>, any][] = [];

    abstract async init(): Promise<void>;

    abstract async set(val: T): Promise<boolean>;
}
setInterval(() => {
    const queue = MachineOutput.retryQueue;
    MachineOutput.retryQueue = [];
    for (const [out, val] of queue) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        out.trySet(val);
    }
}, 5);

abstract class Solenoid extends MachineOutput<boolean> {
    constructor(
        name: keyof MachineOutputs,
        public num: number,
        public board: Solenoid16,
    ) {
        super(false, name);
    }
}

class MomentarySolenoid extends Solenoid {
    lastFired?: Time;

    constructor(
        name: keyof MachineOutputs,
        num: number,
        board: Solenoid16,
        public ms = 25,
        public wait = 500,
    ) {
        super(name, num, board);
    }

    async init() {
        await this.board.initMomentary(this.num, 25);
    }

    async fire(ms?: number): Promise<boolean> {
        if (this.lastFired && time() < this.lastFired + this.wait) return false;

        this.lastFired = time();
        if (ms)
            await this.board.fireSolenoidFor(this.num, ms);
        else
            await this.board.fireSolenoid(this.num);
        return true;
    }

    async set(on: boolean) {
        if (on) return this.fire();
        return true;
    }
}

class IncreaseSolenoid extends MomentarySolenoid {
    i = 0;

    constructor(
        name: keyof MachineOutputs,
        num: number,
        board: Solenoid16,
        public initial: number,
        public max: number,
        public steps = 3,
        public resetPeriod = 2000,
    ) {
        super(name, num, board);
    }

    async fire(): Promise<boolean> {
        if (!this.lastFired)
            return super.fire();
        else {
            if (time() > (this.lastFired + this.resetPeriod)) {
                this.i = 0;
                return super.fire();
            } else {
                const fired = super.fire((this.max - this.initial)/(this.steps-1) * this.i + this.initial);
                if (fired && this.i < this.steps - 1)
                    this.i++;
                return fired;
            }
        }
    }
}

class OnOffSolenoid extends Solenoid {
    async init() {
        await this.board.initOnOff(this.num);
    }

    async set(on: boolean) {
        if (on)
            await this.board.turnOnSolenoid(this.num);
        else
            await this.board.turnOffSolenoid(this.num);
        return true;
    }
}

export type MachineOutputs = {
    rampUp: boolean;
    upper3: boolean;
    temp: number;
};

class Machine extends Mode<MachineOutputs> {
    outs = new Outputs<MachineOutputs>(this, {
        rampUp: false,
        upper3: false,
        temp: () => 0,
    });

    solenoidBank1 = new Solenoid16(0);
    cRamp = new OnOffSolenoid('rampUp', 0, this.solenoidBank1);
    cUpper3 = new IncreaseSolenoid('upper3', 7, this.solenoidBank1, 30, 100);

    sRightInlane = new Switch(0, 4, 'right inlane');
    sShooterLane2 = new Switch(2, 0, 'shooter lane star');
    sPopBumper = new Switch(4, 7, 'pop bumper');

    sUpper3 = [
        new Switch(5, 2, 'upper3 1'),
        new Switch(5, 1, 'upper3 2'),
        new Switch(5, 0, 'upper3 3'),
    ];

}

export let machine = new Machine();

export function resetMachine() {
    MachineOutput.retryQueue = [];
    machine = new Machine();
}

export type MachineMode = Mode<MachineOutputs>;