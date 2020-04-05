import { State, Tree } from './state';
import { Solenoid16 } from './boards';
import { matrix, Switch, onSwitchClose, onClose } from './switch-matrix';
import { Events, Event } from './events';
import { Mode } from './mode';
import { Outputs, TreeOutputEvent, OwnOutputEvent, toggle } from './outputs';
import { safeSetInterval, Time, time, Timer, TimerQueueEntry } from './timer';
import { assert, getTypeIn } from './util';
import { DropBank, DropTarget } from './drop-bank';
import { Log } from './log';
import { Color } from './light';
import { gfxLights, gfxImages } from './gfx';

abstract class MachineOutput<T, Outs = MachineOutputs> {
    actual!: T;
    timer?: TimerQueueEntry;

    constructor(
        public val: T,
        public name: keyof Outs,
    ) {
        this.actual = val;
        Events.listen<TreeOutputEvent<any>>(ev => this.trySet(ev.value),
            ev => ev instanceof TreeOutputEvent && ev.tree === machine && ev.prop === name);
    }

    async trySet(val: T) {
        this.stopRetry();
        if (val === this.actual) {
            return;
        }
        try {
            this.val = val;
            if (this.actual === val) return;
            Log.trace(['machine'], 'try set %s to ', this.name, val);
            let success = await this.set(val);
            Log.trace('machine', '%s set: ', this.name, success);
            if (success === true) {
                this.actual = val;
            } else {
                if (!success) success = 5;
                if (!this.timer)
                    this.timer = Timer.callIn(() => this.trySet(val), success, `delayed retry set ${this.name} to ${val}`);
            }

        } catch (err) {
            Log.error(['machine'], 'error setting output %s to ', this.name, val, err);
            debugger;
            if (!this.timer)
                this.timer = Timer.callIn(() => this.trySet(val), 5, `delayed retry set ${this.name} to ${val}`);
        }
    }

    private stopRetry() {
        if (this.timer) {
            Timer.cancel(this.timer);
            this.timer = undefined;
        }
    }

    abstract async init(): Promise<void>;

    abstract async set(val: T): Promise<boolean|number>;
}

export abstract class Solenoid extends MachineOutput<boolean> {
    lastFired?: Time;

    constructor(
        name: keyof MachineOutputs,
        public num: number,
        public board: Solenoid16,
    ) {
        super(false, name);
    }
}

export class MomentarySolenoid extends Solenoid {
    lastFired?: Time;

    static firingUntil?: Time;

    constructor(
        name: keyof MachineOutputs,
        num: number,
        board: Solenoid16,
        public readonly ms = 25, // fire time
        public wait = 1000, // min time between fire attempts
    ) {
        super(name, num, board);
    }

    async init() {
        Log.info(['machine', 'solenoid'], 'init %s as momentary, pulse %i', this.name, this.ms);
        await this.board.initMomentary(this.num, this.ms);
    }

    async fire(ms?: number): Promise<boolean|number> {
        if (this.lastFired && time() < this.lastFired + this.wait) {
            Log.trace(['machine', 'solenoid'], 'skip firing solenoid %s, too soon', this.name);
            return this.lastFired + this.wait - time() + 3;
        }
        if (MomentarySolenoid.firingUntil) {
            if (time() <= MomentarySolenoid.firingUntil) {
                Log.trace(['machine', 'solenoid'], 'skip firing solenoid %s, global too soon', this.name);
                return MomentarySolenoid.firingUntil - time() + 1;
            }
            MomentarySolenoid.firingUntil = undefined;
        }

        this.lastFired = time();
        MomentarySolenoid.firingUntil = time() + (ms ?? this.ms) as Time;
        Log.log(['machine', 'solenoid'], 'fire solenoid %s for %i', this.name, ms ?? this.ms);
        Events.fire(new SolenoidFireEvent(this));

        if (ms)
            await this.board.fireSolenoidFor(this.num, ms);
        else
            await this.board.fireSolenoid(this.num);

        return (ms ?? this.ms) + this.wait + 3;
    }

    async set(on: boolean) {
        if (on) return this.fire();
        return true;
    }
}
export class SolenoidFireEvent extends Event {
    constructor(
        public coil: MomentarySolenoid,
    ) {
        super();
    }
}

export class IncreaseSolenoid extends MomentarySolenoid {
    i = 0;

    constructor(
        name: keyof MachineOutputs,
        num: number,
        board: Solenoid16,
        public initial: number,
        public max: number,
        public steps = 3,
        wait?: number,
        public resetPeriod = 2000,
    ) {
        super(name, num, board, initial, wait);
        assert(steps >= 2);
    }

    async fire(): Promise<boolean|number> {
        let fired: boolean|number = false;
        if (!this.lastFired)
            fired = await super.fire(this.initial);
        else {
            if (time() > (this.lastFired + this.resetPeriod)) {
                this.i = 0;
                fired = await super.fire(this.initial);
            } else {
                fired = await super.fire((this.max - this.initial)/(this.steps-1) * this.i + this.initial);
            }
        } 
        if (fired && this.i < this.steps - 1)
            this.i++;
        return fired;
    }
}

export class OnOffSolenoid extends Solenoid {
    constructor(
        name: keyof CoilOutputs,
        num: number,
        board: Solenoid16,
        public maxOnTime?: number,
        public pulseOffTime?: number,
    ) {
        super(name, num, board);
    }
    async init() {
        Log.info(['machine', 'solenoid'], 'init %s as on off, max %i %i', this.name, this.maxOnTime, this.pulseOffTime);
        await this.board.initOnOff(this.num, this.maxOnTime, this.pulseOffTime);
    }

    async set(on: boolean) {
        Log.log(['machine', 'solenoid'], `turn ${this.name} ` + (on? 'on':'off'));
        if (on)
            await this.board.turnOnSolenoid(this.num);
        else
            await this.board.turnOffSolenoid(this.num);
        return true;
    }

    async toggle() {
        return this.board.toggleSolenoid(this.num);
    }
}



export class Light extends MachineOutput<Color[], LightOutputs> {
    constructor(
        name: keyof LightOutputs,
        public num: number,
    ) {
        super([], name);
    }

    async init() {

    }

    async set(state: Color[]) {
        if (!gfxLights) return false;
        const l = gfxLights[this.name];
        if (l?.l) {
            l.l!.set(state);
            return true;
        }
        return false;
    }
}


export class Image extends MachineOutput<string, ImageOutputs> {
    constructor(
        name: keyof ImageOutputs,
    ) {
        super('', name);
    }

    async init() {

    }

    async set(state: string) {
        if (!gfxImages) return false;
        const l = gfxImages[this.name];
        if (l?.l) {
            l.l!.set(state);
            return true;
        }
        return false;
    }
}

export type MachineOutputs = CoilOutputs&LightOutputs&ImageOutputs;

export type CoilOutputs = {
    rampUp: boolean;
    upper3: boolean;
    outhole: boolean;
    troughRelease: boolean;
    miniEject: boolean;
    miniBank: boolean;
    miniDiverter: boolean;
    leftBank: boolean;
    rightBank: boolean;
    centerBank: boolean;
    upper2: boolean;
    upperEject: boolean;
    lockPost: boolean;
    upperMagnet: boolean;
    leftMagnet: boolean;
    leftGate: boolean;
    rightGate: boolean;
    shooterDiverter: boolean;
    popper: boolean;
    temp: number;
    right1: boolean;
    right2: boolean;
    right3: boolean;
    right4: boolean;
    right5: boolean;
};

export type LightOutputs = {
    lLowerRamp: Color[];
};
export type ImageOutputs = {
    iCenter1: string;
    iCenter2: string;
    iCenter3: string;
    iUpper31: string;
    iUpper32: string;
    iUpper33: string;
    iUpper21: string;
    iUpper22: string;
    iLeft1: string;
    iLeft2: string;
    iLeft3: string;
    iLeft4: string;
    iRight1: string;
    iRight2: string;
    iRight3: string;
    iRight4: string;
    iRight5: string;
    iMini1: string;
    iMini2: string;
    iMini3: string;
};

export class Machine extends Mode<MachineOutputs> {
    outs = new Outputs<MachineOutputs>(this, {
        rampUp: false,
        upper3: false,
        outhole: false,
        troughRelease: false,
        miniEject: false,
        miniBank: false,
        miniDiverter: false,
        leftBank: false,
        rightBank: false,
        centerBank: false,
        upper2: false,
        upperEject: false,
        lockPost: false,
        upperMagnet: false,
        leftMagnet: false,
        leftGate: false,
        rightGate: false,
        shooterDiverter: false,
        popper: false,
        right1: false,
        right2: false,
        right3: false,
        right4: false,
        right5: false,
        temp: () => 0,
        lLowerRamp: [],
        iCenter1: '',
        iCenter2: '',
        iCenter3: '',
        iUpper31: '',
        iUpper32: '',
        iUpper33: '',
        iUpper21: '',
        iUpper22: '',
        iLeft1: '',
        iLeft2: '',
        iLeft3: '',
        iLeft4: '',
        iRight1: '',
        iRight2: '',
        iRight3: '',
        iRight4: '',
        iRight5: '',
        iMini1: '',
        iMini2: '',
        iMini3: '',
    });

    solenoidBank1 = new Solenoid16(0);
    cOuthole = new IncreaseSolenoid('outhole', 0, this.solenoidBank1, 25, 40, 4);
    cTroughRelease = new IncreaseSolenoid('troughRelease', 1, this.solenoidBank1, 50, 500, 3, 1000);
    cPopper = new MomentarySolenoid('popper', 2, this.solenoidBank1, 25);
    cMiniDiverter = new OnOffSolenoid('miniDiverter', 4, this.solenoidBank1, 25, 5);
    cShooterDiverter = new OnOffSolenoid('shooterDiverter', 5, this.solenoidBank1);
    cLeftBank = new IncreaseSolenoid('leftBank', 7, this.solenoidBank1, 30, 100);
    cCenterBank = new IncreaseSolenoid('centerBank', 8, this.solenoidBank1, 30, 100);
    cLeftMagnet = new OnOffSolenoid('leftMagnet', 9, this.solenoidBank1, 10000);
    cLockPost = new IncreaseSolenoid('lockPost', 10, this.solenoidBank1, 200, 800, 4, 2000);
    cRamp = new OnOffSolenoid('rampUp', 13, this.solenoidBank1, 100, 4);
    cMiniEject = new IncreaseSolenoid('miniEject', 12, this.solenoidBank1, 22, 40, 6, Number.POSITIVE_INFINITY, 5000);
    cMiniBank = new IncreaseSolenoid('miniBank', 14, this.solenoidBank1, 30, 100);

    solenoidBank2 = new Solenoid16(2);
    cUpper2 = new IncreaseSolenoid('upper2', 11, this.solenoidBank2, 30, 100);
    cUpper3 = new IncreaseSolenoid('upper3', 10, this.solenoidBank2, 30, 100);
    cUpperEject = new IncreaseSolenoid('upperEject', 9, this.solenoidBank2, 4, 8, 4);
    cLeftGate = new OnOffSolenoid('leftGate', 6, this.solenoidBank2, 25, 5);
    cRightBank = new IncreaseSolenoid('rightBank', 14, this.solenoidBank2, 30, 100);
    cRightDown = [
        new IncreaseSolenoid('right1', 0, this.solenoidBank2, 25, 50, 3, 250),
        new IncreaseSolenoid('right2', 1, this.solenoidBank2, 25, 50, 3, 250),
        new IncreaseSolenoid('right3', 2, this.solenoidBank2, 25, 50, 3, 250),
        new IncreaseSolenoid('right4', 4, this.solenoidBank2, 25, 50, 3, 250),
        new IncreaseSolenoid('right5', 5, this.solenoidBank2, 25, 50, 3, 250),
    ];

    sLeftInlane = new Switch(1, 2, 'left inlane');
    sLeftOutlane = new Switch(1, 1, 'left outlane');
    sRightInlane = new Switch(0, 5, 'right inlane');
    sRightOutlane = new Switch(0, 4, 'right outlane');
    sMiniEntry = new Switch(1, 3, 'mini entry');
    sMiniOut = new Switch(0, 3, 'mini out');
    sMiniMissed = new Switch(1, 4, 'mini missed');
    sOuthole = new Switch(0, 2, 'outhole', 500, 500);
    sTroughFull = new Switch(0, 1, 'trough full');
    sLeftSling = new Switch(1, 0, 'left sling');
    sRightSling = new Switch(0, 7, 'right sling');
    sMiniLeft = new Switch(1, 7, 'mini left', 100, 250);
    sMiniCenter = new Switch(1, 6, 'mini center', 100, 250);
    sMiniRight = new Switch(1, 5, 'mini right', 100, 250);
    sCenterLeft = new Switch(4, 3, 'center left', 100, 250);
    sCenterCenter = new Switch(4, 2, 'center center', 100, 250);
    sCenterRight = new Switch(4, 1, 'center right', 100, 250);
    sLeft1 = new Switch(3, 1, 'left 1', 100, 250);
    sLeft2 = new Switch(3, 2, 'left 2', 100, 250);
    sLeft3 = new Switch(3, 3, 'left 3', 100, 250);
    sLeft4 = new Switch(3, 5, 'left 4', 100, 250);
    sRight1 = new Switch(2, 5, 'right 1', 100, 250);
    sRight2 = new Switch(2, 4, 'right 2', 100, 250);
    sRight3 = new Switch(2, 3, 'right 3', 100, 250);
    sRight4 = new Switch(2, 2, 'right 4', 100, 250);
    sRight5 = new Switch(2, 1, 'right 5', 100, 250);
    sLeftBack1 = new Switch(3, 4, 'left back 1');
    sLeftBack2 = new Switch(3, 6, 'left back 2');
    sCenterBackLeft = new Switch(4, 6, 'center back left');
    sCenterBackCenter = new Switch(4, 5, 'center back center');
    sCenterBackRight = new Switch(4, 4, 'center back right');
    sUpper3Left = new Switch(5, 2, 'upper 3 left', 100, 250);
    sUpper3Center = new Switch(5, 1, 'upper 3 center', 100, 250);
    sUpper3Right = new Switch(5, 0, 'upper 3 right', 100, 250);
    sUpper2Left = new Switch(6, 4, 'upper 2 left', 100, 250);
    sUpper2Right = new Switch(6, 3, 'upper 2 right', 100, 250);
    sSingleStandup = new Switch(7, 3, 'single standup');
    sRampMini = new Switch(3, 7, 'ramp mini');
    sRampMiniOuter = new Switch(3, 0, 'ramp mini outer');
    sRampDown = new Switch(7, 4, 'ramp down');
    sUnderRamp = new Switch(7, 7, 'under ramp');
    sLeftOrbit = new Switch(7, 2, 'left orbit');
    sSpinner = new Switch(6, 6, 'spinner');
    sSpinnerMini = new Switch(6, 2, 'spinner mini');
    sUpperPopMini = new Switch(6, 7, 'upper pop mini');
    sSidePopMini = new Switch(6, 0, 'side pop mini');
    sShooterUpper = new Switch(2, 6, 'shooter upper');
    sShooterMagnet = new Switch(2, 7, 'shooter magnet');
    sShooterLane = new Switch(0, 0, 'shooter lane');
    sShooterLower = new Switch(2, 0, 'shooter lower');
    sBackLane = new Switch(5, 6, 'back lane');
    sPop = new Switch(4, 7, 'pop');
    sUpperInlane = new Switch(7, 1, 'upper inlane');
    sUnderUpperFlipper = new Switch(7, 5, 'under upper flipper');
    sUpperSideTarget = new Switch(6, 1, 'upper side target');
    sUpperEject = new Switch(7, 6, 'upper eject');
    sUpperLaneLeft = new Switch(6, 5, 'upper lane left');
    sUpperLaneRight = new Switch(5, 7, 'upper lane right');
    sLowerLaneLeft = new Switch(5, 5, 'lower lane left');
    sLowerLaneRight = new Switch(5, 4, 'lower lane right');
    sLowerLaneCenter = new Switch(5, 3, 'lower lane center');
    sRampMade = new Switch(7, 0, 'ramp made');
    sPopperButton = new Switch(4, 8, 'popper button');

    lRampDown = new Light('lLowerRamp', 0);

    dropTargets: DropTarget[] = [];

    upper3Bank = new DropBank(this, this.cUpper3, 
        [ this.sUpper3Left, this.sUpper3Center, this.sUpper3Right ],
        [14, 15, 16],
        ['iUpper31', 'iUpper32', 'iUpper33']);
    upper2Bank = new DropBank(this, this.cUpper2, 
        [ this.sUpper2Left, this.sUpper2Right ],
        [12, 13], 
        ['iUpper21', 'iUpper22']);
    centerBank = new DropBank(this, this.cCenterBank, 
        [ this.sCenterLeft, this.sCenterCenter, this.sCenterRight ],
        [0, 1, 2],
        ['iCenter1', 'iCenter2', 'iCenter3']);
    miniBank = new DropBank(this, this.cMiniBank,
        [ this.sMiniLeft, this.sMiniCenter, this.sMiniRight ],
        [17, 18, 19],
        ['iMini1', 'iMini2', 'iMini3']);
    leftBank = new DropBank(this, this.cLeftBank, 
        [ this.sLeft1, this.sLeft2, this.sLeft3, this.sLeft4 ],
        [8, 9, 10, 11],
        ['iLeft1', 'iLeft2', 'iLeft3', 'iLeft4']);
    rightBank = new DropBank(this, this.cRightBank,
        [ this.sRight1, this.sRight2, this.sRight3, this.sRight4, this.sRight5],
        [3, 4, 5, 6, 7],
        ['iRight1', 'iRight2', 'iRight3', 'iRight4', 'iRight5']);

    async initOutputs() {
        Log.info(['machine', 'console'], 'initializing outputs...');
        for (const key of Object.keys(this)) {
            const obj = (this as any)[key];
            if (typeof obj === 'object' && obj.init)
                await obj.init();
        }
    }

    constructor() {
        super();
        // this.listen(onClose(), 'up');
    }
}

export type MachineMode = Mode<MachineOutputs>;



export function expectMachineOutputs(...names: (keyof MachineOutputs)[]): jest.SpyInstance[] {
    const ret = [];
    for (const out of getTypeIn<MachineOutput<any>>(machine, MachineOutput)) {
        if (names.includes(out.name)) {
            ret.push(jest.spyOn(out, 'set').mockResolvedValue(true));
        }
    }

    return ret;
}

class MachineOverrides extends Mode<MachineOutputs> {
    constructor() {
        super(undefined, 999);
        this.out = new Outputs(this, {
            rampUp: toggle({
                on: () => machine.sRampDown.state && machine.sUnderRamp.wasClosedWithin(250),
                off: () => machine.sUnderRamp.openForAtLeast(1000),
            }),
        });

        this.addChild(new EosPulse(machine.cRamp, machine.sRampDown));
    }
}

class EosPulse extends Mode<MachineOutputs> {
    // pulse coil if switch closes
    constructor(coil: OnOffSolenoid, sw: Switch, invert = false) {
        super(undefined, 999);

        Events.listen(() => coil.set(true), onSwitchClose(sw));
        // this.out = new Outputs(this, {
        //     rampUp: (up) => {
        //         const wrong = (sw.state !== invert);
        //         if (!up) return false;
        //         if (wrong) {
        //             Log.log(['machine', 'console'], 'coil %s needed eos pulse', coil.name);
        //             coil.set(true);
        //             return true;
        //         }
        //         return true;
        //         // const wrong = (sw.wasClosedWithin(1) !== invert);
        //         // if (!up) return false;
        //         // if (wrong) {
        //         //     Log.log(['machine', 'console'], 'coil %s needed eos pulse', coil.name);
        //         //     return false;
        //         // }
        //         // if (sw.state && coil.actual !== coil.val) return false;
        //         // return true;
        //     },
        // });
    }
}





export function resetMachine(): Machine {
    machine = new Machine();
    MomentarySolenoid.firingUntil = undefined;
    

    machine.addChild(new MachineOverrides());

    Events.listen(e => machine.handleEvent(e), () => true);

    return machine;
}
export let machine = resetMachine();