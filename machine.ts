import { State, Tree } from './state';
import { Solenoid16 } from './boards';
import { matrix, Switch } from './switch-matrix';
import { Events } from './events';
import { Mode } from './mode';
import { Outputs, TreeOutputEvent, OwnOutputEvent } from './outputs';
import { safeSetInterval, Time, time, Timer } from './timer';
import { assert } from './util';

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
            let success = await this.set(val);
            if (!success) success = 5;
            else if (success === true)
                this.actual = val;
            else
                Timer.callIn(() => this.trySet(val), success, `delayed retry set ${this.name} to ${val}`);

        } catch (err) {
            console.error('error setting output %s to ', this.name, val, err);
            Timer.callIn(() => this.trySet(val), 5, `delayed retry set ${this.name} to ${val}`);
        }
    }

    abstract async init(): Promise<void>;

    abstract async set(val: T): Promise<boolean|number>;
}

abstract class Solenoid extends MachineOutput<boolean> {
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

    constructor(
        name: keyof MachineOutputs,
        num: number,
        board: Solenoid16,
        public ms = 25, // fire time
        public wait = 500, // min time between fire attempts
    ) {
        super(name, num, board);
    }

    async init() {
        await this.board.initMomentary(this.num, this.ms);
    }

    async fire(ms?: number): Promise<boolean|number> {
        if (this.lastFired && time() < this.lastFired + this.wait) return this.lastFired + this.wait - time() + 3;

        this.lastFired = time();
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

export class SingleSolenoid extends Solenoid {
    lastFired?: Time;

    constructor(
        name: keyof MachineOutputs,
        num: number,
        board: Solenoid16,
        public ms = 25, // fire time
    ) {
        super(name, num, board);
    }

    async init() {
        await this.board.initMomentary(this.num, this.ms);
    }

    async fire(ms?: number): Promise<boolean|number> {
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

class OnOffSolenoid extends Solenoid {
    constructor(
        name: keyof MachineOutputs,
        num: number,
        board: Solenoid16,
        public maxOnTime?: number,
        public pulseOffTime?: number,
    ) {
        super(name, num, board);
    }
    async init() {
        await this.board.initOnOff(this.num, this.maxOnTime, this.pulseOffTime);
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
};

class Machine extends Mode<MachineOutputs> {
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
        temp: () => 0,
    });

    solenoidBank1 = new Solenoid16(0);
    cOuthole = new IncreaseSolenoid('outhole', 0, this.solenoidBank1, 18, 40, 4);
    cTroughRelease = new IncreaseSolenoid('troughRelease', 1, this.solenoidBank1, 50, 500, 3, 1000);
    cPopper = new SingleSolenoid('popper', 2, this.solenoidBank1, 40);
    cMiniDiverter = new OnOffSolenoid('miniDiverter', 4, this.solenoidBank1, 25, 5);
    cShooterDiverter = new OnOffSolenoid('shooterDiverter', 5, this.solenoidBank1);
    cLeftBank = new IncreaseSolenoid('leftBank', 7, this.solenoidBank1, 30, 100);
    cCenterBank = new IncreaseSolenoid('centerBank', 8, this.solenoidBank1, 30, 100);
    cLeftMagnet = new OnOffSolenoid('centerBank', 9, this.solenoidBank1, 10000);
    cLockPost = new IncreaseSolenoid('lockPost', 10, this.solenoidBank1, 200, 800, 4, 2000);
    cRamp = new OnOffSolenoid('rampUp', 11, this.solenoidBank1);
    cMiniEject = new IncreaseSolenoid('miniEject', 12, this.solenoidBank1, 22, 40, 6, Number.POSITIVE_INFINITY, 5000);
    cMiniBank = new IncreaseSolenoid('miniBank', 14, this.solenoidBank1, 30, 100);

    solenoidBank2 = new Solenoid16(1);
    cUpper2 = new IncreaseSolenoid('upper2', 6, this.solenoidBank2, 30, 100);
    cUpper3 = new IncreaseSolenoid('upper3', 7, this.solenoidBank2, 30, 100);
    cUpperEject = new IncreaseSolenoid('upperEject', 8, this.solenoidBank2, 15, 25, 4);
    cLeftGate = new OnOffSolenoid('leftGate', 11, this.solenoidBank2, 25, 5);
    cRightBank = new IncreaseSolenoid('rightBank', 12, this.solenoidBank2, 30, 100);


    sLeftInlane = new Switch(1, 2, 'left inlane');
    sLeftOutlane = new Switch(1, 1, 'left outlane');
    sRightInlane = new Switch(0, 4, 'right inlane');
    sRightOutlane = new Switch(0, 5, 'right outlane');
    sMiniEntry = new Switch(1, 3, 'mini entry');
    sMiniOut = new Switch(0, 3, 'mini out');
    sMiniMissed = new Switch(1, 4, 'mini missed');
    sOuthole = new Switch(0, 2, 'outhole');
    sTroughFull = new Switch(0, 1, 'trough full');
    sLeftSling = new Switch(1, 0, 'left sling');
    sRightSling = new Switch(0, 7, 'right sling');
    sMiniLeft = new Switch(1, 7, 'mini left');
    sMiniCenter = new Switch(1, 6, 'mini center');
    sMiniRight = new Switch(1, 5, 'mini right');
    sCenterLeft = new Switch(4, 3, 'center left');
    sCenterCenter = new Switch(4, 2, 'center center');
    sCenterRight = new Switch(4, 1, 'center right');
    sLeft1 = new Switch(3, 1, 'left 1');
    sLeft2 = new Switch(3, 2, 'left 2');
    sLeft3 = new Switch(3, 3, 'left 3');
    sLeft4 = new Switch(3, 5, 'left 4');
    sRight1 = new Switch(2, 5, 'right 1');
    sRight2 = new Switch(2, 4, 'right 2');
    sRight3 = new Switch(2, 3, 'right 3');
    sRight4 = new Switch(2, 2, 'right 4');
    sRight5 = new Switch(2, 1, 'right 5');
    sLeftBack1 = new Switch(3, 4, 'left back 1');
    sLeftBack2 = new Switch(3, 6, 'left back 2');
    sCenterBackLeft = new Switch(4, 6, 'center back left');
    sCenterBackCenter = new Switch(4, 5, 'center back center');
    sCenterBackRight = new Switch(4, 4, 'center back right');
    sUpper3Left = new Switch(5, 2, 'upper 3 left');
    sUpper3Center = new Switch(5, 1, 'upper 3 center');
    sUpper3Right = new Switch(5, 0, 'upper 3 right');
    sUpper2Left = new Switch(6, 4, 'upper 2 left');
    sUpper2Right = new Switch(6, 3, 'upper 2 right');
    sSingleStandup = new Switch(7, 3, 'single standup');
    sRampMini = new Switch(3, 7, 'ramp mini');
    sRampMiniOuter = new Switch(3, 0, 'ramp mini outer');
    sRampUp = new Switch(7, 4, 'ramp up');
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

    sUpper3 = [ this.sUpper3Left, this.sUpper3Center, this.sUpper3Right ];
    sUpper2 = [ this.sUpper2Left, this.sUpper2Right ];
    sCenter = [ this.sCenterLeft, this.sCenterCenter, this.sCenterRight ];
    sLeft = [ this.sLeft1, this.sLeft2, this.sLeft3, this.sLeft4 ];
    sRight = [ this.sRight1, this.sRight2, this.sRight3, this.sRight4, this.sRight5];
    sMini = [ this.sMiniLeft, this.sMiniCenter, this.sMiniRight ];
}

export let machine = new Machine();

export function resetMachine() {
    machine = new Machine();
}

export type MachineMode = Mode<MachineOutputs>;