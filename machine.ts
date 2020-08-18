import { State, StateEvent } from './state';
import { Solenoid16 } from './boards';
import { matrix, Switch, onSwitchClose, onClose, onAnyPfSwitchExcept, onAnySwitchClose } from './switch-matrix';
import { Events, Event, EventTypePredicate, EventListener } from './events';
import { Mode, Modes } from './mode';
import { Outputs, TreeOutputEvent, OwnOutputEvent, toggle } from './outputs';
import { safeSetInterval, Time, time, Timer, TimerQueueEntry, wait } from './timer';
import { assert, getTypeIn, then, eq as eq } from './util';
import { DropBank, DropTarget } from './drop-bank';
import { Log } from './log';
import { Color } from './light';
import { gfxLights, gfxImages, gfx, screen } from './gfx';
import { Tree } from './tree';
import { MPU } from './mpu';
import { Node } from 'aminogfx-gl';
import { curRecording } from './recording';
import { fork } from './promises';

abstract class MachineOutput<T, Outs = MachineOutputs> {
    static id = 1;
    id = MachineOutput.id++;
    actual!: T;
    timer?: TimerQueueEntry;
    lastActualChange?: Time;

    constructor(
        public val: T,
        public name: keyof Outs,
    ) {
        State.declare<MachineOutput<T, Outs>>(this, ['val', 'actual', 'lastActualChange']);

        this.actual = val;
        Events.listen<TreeOutputEvent<any>>(ev => {
            this.val = ev.value;
            fork(this.trySet(), `try set ${this.name} to ${this.val}`);
        }, 
            ev => ev instanceof TreeOutputEvent && ev.tree === machine && ev.prop === name);

    }

    trySet(): Promise<void>|void {
        // if (val === this.val) return;
        this.stopRetry();
        if (eq(this.val, this.actual)) {
            return undefined;
        }
        Log[this instanceof Solenoid? 'log':'trace'](['machine'], 'try set %s to ', this.name, this.val);
        return then(this.set(this.val), success => {
            try {
                if (success === true) {
                    Log.log('machine', '%s set to ', this.name, this.val);
                    this.lastActualChange = time();
                    this.actual = this.val;
                } else {
                    if (!success) {
                        Log.log('machine', 'failed  %s set to ', this.name, this.val);
                        success = 5;
                    } else 
                        Log.log('machine', 'tried  %s set to ', this.name, this.val);
                    if (!this.timer)
                        this.timer = Timer.callIn(() => this.trySet(), success, `delayed retry set ${this.name} to ${this.val}`);
                }
            } catch (err) {
                Log.error(['machine'], 'error setting output %s to ', this.name, this.val, err);
                debugger;
                if (!this.timer)
                    this.timer = Timer.callIn(() => this.trySet(), 5, `delayed retry set ${this.name} to ${this.val}`);
            }
        });
    }

    private stopRetry() {
        if (this.timer) {
            Timer.cancel(this.timer);
            this.timer = undefined;
        }
    }

    abstract async init(): Promise<void>;

    abstract set(val: T): Promise<boolean|number>|boolean|number;
}

export abstract class Solenoid extends MachineOutput<boolean> {

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
        public fake?: () => void,
    ) {
        super(name, num, board);
    }

    async init() {
        if (this.num < 0) return;
        Log.info(['machine', 'solenoid'], 'init %s as momentary, pulse %i', this.name, this.ms);
        await this.board.initMomentary(this.num, this.ms);
    }

    async fire(ms?: number): Promise<boolean|number> {
        if (this.num < 0) return true;
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
        MomentarySolenoid.firingUntil = time() + (ms ?? this.ms)+100 as Time;
        Log.log(['machine', 'solenoid'], 'fire solenoid %s for %i', this.name, ms ?? this.ms);
        Events.fire(new SolenoidFireEvent(this));

        if (!MPU.isConnected && gfx && !curRecording && this.fake) void wait(100).then(() => this.fake!());
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
        fake?: () => void,
    ) {
        super(name, num, board, initial, wait, fake);
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
        public pulseOnTime?: number,
        public fake?: (on: boolean) => void,
    ) {
        super(name, num, board);
    }
    async init() {
        Log.info(['machine', 'solenoid'], 'init %s as on off, max %i %i', this.name, this.maxOnTime, this.pulseOffTime);
        await this.board.initOnOff(this.num, this.maxOnTime, this.pulseOffTime, this.pulseOnTime);
    }

    async set(on: boolean) {
        Log.log(['machine', 'solenoid'], `turn ${this.name} ` + (on? 'on':'off'));
        

        if (!MPU.isConnected && gfx && !curRecording && this.fake) void wait(100).then(() => this.fake!(on));
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

    set(state: Color[]): boolean {
        if (!gfx) return true;
        if (!gfxLights) return false;
        const l = gfxLights[this.name];
        if (l?.l) {
            l.l!.set(state);
            return true;
        }
        return false;
    }

    lit(): boolean {
        return this.val.length > 0;
    }

    is(...colors: Color[]): boolean {
        return colors.some(c => this.val.includes(c));
    }

    onChange(): EventTypePredicate<StateEvent<this, 'val'>> {
        return (e: Event) => e instanceof StateEvent
            && e.on === this
            && e.prop === 'val';
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

    set(state: string|Node): boolean {
        if (!gfx) return true;
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
    magnetPost: boolean;
    leftBank: boolean;
    rightBank: boolean;
    realRightBank: boolean;
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
    kickerEnable: boolean;
    right1: boolean;
    right2: boolean;
    right3: boolean;
    right4: boolean;
    right5: boolean;
};

export type LightOutputs = {
    lLowerRamp: Color[];
    lMiniReady: Color[];
    lShooterShowCards: Color[];
    lShooterStartHand: Color[];
    lEjectShowCards: Color[];
    lEjectStartMode: Color[];
    lRampShowCards: Color[];
    lRampStartMb: Color[];
    lRampArrow: Color[];
    lPower1: Color[];
    lPower2: Color[];
    lPower3: Color[];
    lPower4: Color[];
};
export type ImageOutputs = {
    iCenter1: string|Node;
    iCenter2: string|Node;
    iCenter3: string|Node;
    iUpper31: string|Node;
    iUpper32: string|Node;
    iUpper33: string|Node;
    iUpper21: string|Node;
    iUpper22: string|Node;
    iLeft1: string|Node;
    iLeft2: string|Node;
    iLeft3: string|Node;
    iLeft4: string|Node;
    iRight1: string|Node;
    iRight2: string|Node;
    iRight3: string|Node;
    iRight4: string|Node;
    iRight5: string|Node;
    iMini1: string|Node;
    iMini2: string|Node;
    iMini3: string|Node;
    iSS1: string|Node;
    iSS2: string|Node;
    iSS3: string|Node;
    iSS4: string|Node;
    iSS5: string|Node;
    iSS6: string|Node;
    iSS7: string|Node;
    iSpinner: string|Node;
};

export class Machine extends Tree<MachineOutputs> {
    solenoidBank1 = new Solenoid16(0);
    cOuthole = new IncreaseSolenoid('outhole', 0, this.solenoidBank1, 45, 70, 4, undefined, undefined, () => this.sOuthole.state = false);
    cTroughRelease = new IncreaseSolenoid('troughRelease', 1, this.solenoidBank1, 500, 2000, 3, 1000, undefined, () => { this.sTroughFull.state = false; this.sShooterLane.state = true });
    cPopper = new MomentarySolenoid('popper', 2, this.solenoidBank1, 40, 1000);
    cMiniDiverter = new OnOffSolenoid('miniDiverter', 4, this.solenoidBank1, 100, 20, 10);
    cShooterDiverter = new OnOffSolenoid('shooterDiverter', 5, this.solenoidBank1);
    cMagnetPost = new OnOffSolenoid('magnetPost', 6, this.solenoidBank1, 100, 40, 10);
    cLeftBank = new IncreaseSolenoid('leftBank', 7, this.solenoidBank1, 40, 100, undefined, undefined, undefined, () => [this.sLeft1, this.sLeft2, this.sLeft3, this.sLeft4].forEach(t => t.state = false));
    cCenterBank = new IncreaseSolenoid('centerBank', 8, this.solenoidBank1, 50, 100, undefined, undefined, undefined, () => [this.sCenterLeft, this.sCenterCenter, this.sCenterRight].forEach(t => t.state = false));
    cLeftMagnet = new OnOffSolenoid('leftMagnet', 9, this.solenoidBank1, 5000);
    cLockPost = new OnOffSolenoid('lockPost', 10, this.solenoidBank1, 100, 30, 5);
    cRamp = new OnOffSolenoid('rampUp', 11, this.solenoidBank1, 100, 15, 7, on => this.sRampDown.state = !on);
    cMiniEject = new IncreaseSolenoid('miniEject', 12, this.solenoidBank1, 40, 80, 6, Number.POSITIVE_INFINITY, 5000);
    cMiniBank = new IncreaseSolenoid('miniBank', 14, this.solenoidBank1, 40, 100, undefined, undefined, undefined, () => [this.sMiniLeft, this.sMiniRight, this.sMiniCenter].forEach(t => t.state = false));

    solenoidBank2 = new Solenoid16(2);
    cUpper2 = new IncreaseSolenoid('upper2', 11, this.solenoidBank2, 30, 100, undefined, undefined, undefined, () => [this.sUpper2Left, this.sUpper2Right].forEach(t => t.state = false));
    cUpper3 = new IncreaseSolenoid('upper3', 10, this.solenoidBank2, 40, 100, undefined, undefined, undefined, () => [this.sUpper3Left, this.sUpper3Center, this.sUpper3Right].forEach(t => t.state = false));
    cUpperEject = new IncreaseSolenoid('upperEject', 9, this.solenoidBank2, 6, 10, 6, undefined, undefined, () => machine.sUpperEject.state = false);
    cLeftGate = new OnOffSolenoid('leftGate', 6, this.solenoidBank2, 25, 50, 10);
    cRightGate = new OnOffSolenoid('rightGate', 7, this.solenoidBank2);
    cRealRightBank = new IncreaseSolenoid('realRightBank', 12, this.solenoidBank2, 30, 100, undefined, undefined, undefined, () => [this.sRight1, this.sRight2, this.sRight3, this.sRight4, this.sRight5].forEach(t => t.state = false));
    cRightBank = new MomentarySolenoid('rightBank', -1, this.solenoidBank2);
    cRightDown1 = new IncreaseSolenoid('right1', 0, this.solenoidBank2, 35, 60, 3, 500, undefined, () => this.sRight1.state = true);
    cRightDown2 = new IncreaseSolenoid('right2', 1, this.solenoidBank2, 35, 60, 3, 500, undefined, () => this.sRight2.state = true);
    cRightDown3 = new IncreaseSolenoid('right3', 2, this.solenoidBank2, 35, 60, 3, 500, undefined, () => this.sRight3.state = true);
    cRightDown4 = new IncreaseSolenoid('right4', 4, this.solenoidBank2, 35, 60, 3, 500, undefined, () => this.sRight4.state = true);
    cRightDown5 = new IncreaseSolenoid('right5', 5, this.solenoidBank2, 35, 60, 3, 500, undefined, () => this.sRight5.state = true);
    cRightDown = [this.cRightDown1, this.cRightDown2, this.cRightDown3, this.cRightDown4, this.cRightDown5];
    cKickerEnable = new OnOffSolenoid('kickerEnable', 15, this.solenoidBank2);
    cUpperMagnet = new OnOffSolenoid('upperMagnet', 13, this.solenoidBank2, 10000);

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
    sMiniLeft = new Switch(1, 7, 'mini left', 5, 250);
    sMiniCenter = new Switch(1, 6, 'mini center', 5, 250);
    sMiniRight = new Switch(1, 5, 'mini right', 5, 250);
    sCenterLeft = new Switch(4, 3, 'center left', 5, 250);
    sCenterCenter = new Switch(4, 2, 'center center', 5, 250);
    sCenterRight = new Switch(4, 1, 'center right', 5, 250);
    sLeft1 = new Switch(3, 1, 'left 1', 5, 250);
    sLeft2 = new Switch(3, 2, 'left 2', 5, 250);
    sLeft3 = new Switch(3, 3, 'left 3', 5, 250);
    sLeft4 = new Switch(3, 5, 'left 4', 5, 250);
    sRight1 = new Switch(2, 5, 'right 1', 5, 250);
    sRight2 = new Switch(2, 4, 'right 2', 5, 250);
    sRight3 = new Switch(2, 3, 'right 3', 5, 250);
    sRight4 = new Switch(2, 2, 'right 4', 5, 250);
    sRight5 = new Switch(2, 1, 'right 5', 5, 250);
    sLeftBack1 = new Switch(3, 4, 'left back 1');
    sLeftBack2 = new Switch(3, 6, 'left back 2');
    sCenterBackLeft = new Switch(4, 6, 'center back left');
    sCenterBackCenter = new Switch(4, 5, 'center back center');
    sCenterBackRight = new Switch(4, 4, 'center back right');
    sUpper3Left = new Switch(5, 2, 'upper 3 left', 5, 250);
    sUpper3Center = new Switch(5, 1, 'upper 3 center', 5, 250);
    sUpper3Right = new Switch(5, 0, 'upper 3 right', 5, 250);
    sUpper2Left = new Switch(6, 4, 'upper 2 left', 5, 250);
    sUpper2Right = new Switch(6, 3, 'upper 2 right', 5, 250);
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
    sPopperButton = new Switch(5, 8, 'popper button');
    sMagnetButton = new Switch(6, 8, 'magnet button');
    sStartButton = new Switch(0, 8, 'start button');

    pfSwitches = [
        this.sLeftInlane,
        this.sLeftOutlane,
        this.sRightInlane,
        this.sRightOutlane,
        this.sMiniEntry,
        this.sMiniMissed,
        this.sLeftSling,
        this.sRightSling,
        this.sMiniLeft,
        this.sMiniCenter,
        this.sMiniRight,
        this.sCenterLeft,
        this.sCenterCenter,
        this.sCenterRight,
        this.sLeft1,
        this.sLeft2,
        this.sLeft3,
        this.sLeft4,
        this.sRight1,
        this.sRight2,
        this.sRight3,
        this.sRight4,
        this.sRight5,
        this.sLeftBack1,
        this.sLeftBack2,
        this.sCenterBackLeft,
        this.sCenterBackCenter,
        this.sCenterBackRight,
        this.sUpper3Left,
        this.sUpper3Center,
        this.sUpper3Right,
        this.sUpper2Left,
        this.sUpper2Right,
        this.sSingleStandup,
        this.sRampMini,
        this.sRampMiniOuter,
        this.sUnderRamp,
        this.sLeftOrbit,
        this.sSpinner,
        this.sSpinnerMini,
        this.sUpperPopMini,
        this.sSidePopMini,
        this.sShooterUpper,
        this.sShooterMagnet,
        this.sShooterLower,
        this.sBackLane,
        this.sPop,
        this.sUpperInlane,
        this.sUnderUpperFlipper,
        this.sUpperSideTarget,
        this.sUpperEject,
        this.sUpperLaneLeft,
        this.sUpperLaneRight,
        this.sLowerLaneLeft,
        this.sLowerLaneRight,
        this.sLowerLaneCenter,
        this.sRampMade,
    ];

    sTopLanes = [
        this.sBackLane,
        this.sUpperLaneLeft,
        this.sUpperLaneRight,
        this.sLowerLaneCenter,
        this.sLowerLaneRight,
        this.sLowerLaneLeft,
    ];

    lastSwitchHit?: Switch;

    lRampDown = new Light('lLowerRamp', 0);
    lMiniReady = new Light('lMiniReady', 0);
    lShooterShowCards = new Light('lShooterShowCards', 0);
    lShooterStartHand = new Light('lShooterStartHand', 0);
    lEjectShowCards = new Light('lEjectShowCards', 0);
    lEjectStartMode = new Light('lEjectStartMode', 0);
    lRampShowCards = new Light('lRampShowCards', 0);
    lRampStartMb = new Light('lRampStartMb', 0);
    lRampArrow = new Light('lRampArrow', 0);
    lPower1 = new Light('lPower1', 0);
    lPower2 = new Light('lPower2', 0);
    lPower3 = new Light('lPower3', 0);
    lPower4 = new Light('lPower4', 0);

    iSS1 = new Image('iSS1');
    iSS2 = new Image('iSS2');
    iSS3 = new Image('iSS3');
    iSS4 = new Image('iSS4');
    iSS5 = new Image('iSS5');
    iSS6 = new Image('iSS6');
    iSS7 = new Image('iSS7');
    iSpinner = new Image('iSpinner');

    dropTargets: DropTarget[] = [];
    dropBanks: DropBank[] = [];

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

    lockDown = false;
    miniDown = false;
    constructor() {
        super();
        this.makeRoot();
        State.declare<Machine>(this, ['lockDown', 'miniDown', 'lastSwitchHit']);

        this.out = new Outputs<MachineOutputs>(this, {
            rampUp: false,
            upper3: false,
            outhole: false,
            troughRelease: false,
            miniEject: false,
            miniBank: false,
            miniDiverter: () => this.miniDown,
            leftBank: false,
            rightBank: false,
            realRightBank: false,
            centerBank: false,
            upper2: false,
            upperEject: false,
            lockPost: () => this.lockDown,
            upperMagnet: false,
            leftMagnet: false,
            leftGate: false,
            rightGate: false,
            shooterDiverter: false,
            kickerEnable: false,
            popper: false,
            right1: false,
            right2: false,
            right3: false,
            right4: false,
            right5: false,
            magnetPost: false,
            // temp: () => 0,
            lLowerRamp: [],
            lMiniReady: [Color.Red],
            lShooterShowCards: [],
            lShooterStartHand: [],
            lEjectShowCards: [],
            lEjectStartMode: [],
            lRampShowCards: [],
            lRampStartMb: [],
            lRampArrow: [],
            lPower1: [],
            lPower2: [],
            lPower3: [],
            lPower4: [],
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
            iSS1: '',
            iSS2: '',
            iSS3: '',
            iSS4: '',
            iSS5: '',
            iSS6: '',
            iSS7: '',
            iSpinner: '',
        });
    

        this.listen(onSwitchClose(this.sRampMade), () => this.lockDown = true);
        this.listen(onAnyPfSwitchExcept(this.sRampMade), () => this.lockDown = false);

        this.listen([...onSwitchClose(this.sLeftOutlane), () => this.out!.treeValues.lMiniReady.includes(Color.Green)], () => {
            this.miniDown = true;
        });
        this.listen(onAnySwitchClose(this.sMiniMissed, this.sMiniEntry, this.sOuthole), () => this.miniDown = false);

        this.listen(onAnyPfSwitchExcept(), e => this.lastSwitchHit = e.sw);
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
        super(Modes.MachineOverrides);
        this.out = new Outputs(this, {
            rampUp: (up) => (machine.sRampDown.state && machine.sUnderRamp.state)
                || (machine.cRamp.actual && time() - machine.cRamp.lastActualChange! < 1000 && machine.sUnderRamp.wasClosedWithin(1000))?
                true : up,
            realRightBank: () => machine.out!.treeValues.rightBank &&
                !machine.cShooterDiverter.actual && time()-(machine.cShooterDiverter.lastActualChange??0) > 500,
            shooterDiverter: (on) => machine.out!.treeValues.rightBank? false : on,            
        });

        this.addChild(new EosPulse(machine.cRamp, machine.sRampDown));
    }
}

class EosPulse extends Tree<MachineOutputs> {
    // pulse coil if switch closes
    constructor(coil: OnOffSolenoid, sw: Switch, invert = false) {
        super();

        this.listen([...onSwitchClose(sw), () => coil.val], () => coil.set(true));
    }
}




export function resetMachine(): Machine {
    machine = new Machine();
    (global as any).machine = machine;
    MomentarySolenoid.firingUntil = undefined;

    machine.addChild(new MachineOverrides());

    return machine;
}
export let machine: Machine;
