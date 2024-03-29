import { Node } from 'aminogfx-gl';
import { AttractMode } from './attract';
import { Solenoid16 } from './boards';
import { CPU } from './cpu';
import { dInvert, DisplayContent, dMany, dOff } from './disp';
import { DropBank, DropTarget, Standup, Lane, Shot } from './drop-bank';
import { Event, Events, EventTypePredicate, onAny, StateEvent } from './events';
import { Game } from './game';
import { alert, gfx, gfxImages, gfxLights, screen } from './gfx';
import { Color, colorToHex, light, LightState, LPU, NormalizedLight, normalizeLight } from './light';
import { Log } from './log';
import { Mode, Modes } from './mode';
import { Skillshot } from './modes/skillshot';
import { MPU } from './mpu';
import { Outputs, TreeOutputEvent } from './outputs';
import { fork } from './promises';
import { curRecording } from './recording';
import { playMusic, stopMusic } from './sound';
import { onChange, State } from './state';
import { Bumper, Drain, Drop, Hole, Lane as LaneSet, onAnyPfSwitchExcept, onAnySwitchClose, onClose, onOpen, onSwitch, onSwitchClose, onSwitchOpen, Standup as StandupSet, Switch, SwitchEvent } from './switch-matrix';
import { Time, time, Timer, TimerQueueEntry, wait } from './timer';
import { Tree } from './tree';
import { arrayify, assert, eq as eq, getTypeIn, OrArray, then } from './util';
import { FireCoil } from './util-modes';

abstract class MachineOutput<T, Outs = MachineOutputs> {
    static id = 1;
    id = MachineOutput.id++;
    actual!: T;
    timer?: TimerQueueEntry;
    lastActualChange?: Time;
    lastValChange?: Time;
    lastPendingChange?: Time;
    pending!: T;
    changeAttempts = 0;

    constructor(
        public val: T,
        public name: keyof Outs,
        public debounce = 5,
    ) {
        State.declare<MachineOutput<T, Outs>>(this, ['val', 'actual', 'lastActualChange']);

        this.actual = val;
        this.pending = val;
        Events.listen<TreeOutputEvent<any>>(ev => this.changeDetected(ev), 
            ev => ev instanceof TreeOutputEvent && ev.tree === machine && ev.prop === name);
    }

    settle(changeAttempt: number) {
        if (changeAttempt !== this.changeAttempts)
            return undefined;
        if (eq(this.val, this.pending))
            return undefined;
        this.val = this.pending;
        this.lastValChange = time();
        Log.trace('machine', 'output %s settled on ', this.name, this.val);
        return this.trySet();
    }

    changeDetected(ev: TreeOutputEvent<any>) {
        // if (this instanceof Image)
        //     Log.info('machine', 'tree change for disp %i', this.num);
        this.changeAttempts++;
        const pendingChangeAttempt = this.changeAttempts;
        this.lastPendingChange = time();
        this.pending = ev.value;
        if (this.debounce)
            Timer.callIn(() => this.settle(pendingChangeAttempt), this.debounce, `try set ${this.name} to ${this.pending}`);
        else return this.settle(pendingChangeAttempt);
    }

    trySet(): Promise<void>|void {
        this.stopRetry();
        if (eq(this.val, this.actual)) {
            return undefined;
        }
        if (MPU.isLive && !machine.sDetect3.state) {
            this.timer = Timer.callIn(() => this.trySet(), 100, `delayed no-power retry set ${this.name} to ${this.val}`);
            return undefined;
        }
        Log[this instanceof Solenoid? 'log':'trace'](['machine'], 'try set %s to ', this.name, this.val);
        return then(this.set(this.val), success => {
            try {
                if (success instanceof Error) throw success;
                if (success === true) {
                    this.setSuccess(this.val);
                } else {
                    if (!success) {
                        Log.log('machine', 'failed to %s set to ', this.name, this.val);
                        success = 5;
                    } else 
                        Log.info('machine', 'will retry %s set to ', this.name, this.val);
                    if (!this.timer)
                        this.timer = Timer.callIn(() => this.trySet(), success, `delayed retry set ${this.name} to ${this.val}`);
                }
            } catch (err) {
                Log.error(['machine'], 'error setting output %s to ', this.name, this.val, err);
                // debugger;
                if (!this.timer)
                    this.timer = Timer.callIn(() => this.trySet(), 5, `delayed retry set ${this.name} to ${this.val}`);
            }
        });
    }

    setSuccess(val: T, x = this) {
        Log.info('machine', '%s successfully set to ', x.name, val);
        x.lastActualChange = time();
        x.actual = val;
    }

    private stopRetry() {
        if (this.timer) {
            Timer.cancel(this.timer);
            this.timer = undefined;
        }
    }

    abstract init(): Promise<void>;

    abstract set(val: T): Promise<boolean|number>|boolean|number;
}

abstract class BatchedOutput<T extends { hash: string }|undefined, Outs = MachineOutputs> extends MachineOutput<T, Outs> {
    static pendingOuts: { [value: string]: BatchedOutput<any>[] } = {};
    static valOuts: { [value: string]: BatchedOutput<any>[] } = {};
    constructor(
        val: T,
        name: keyof Outs,
        public type: string,
    ) {
        super(val, name, 10);
        (BatchedOutput.pendingOuts[this.hash()] ??= []).push(this as any);
    }

    hash(): string {
        return this.type+"_"+(this.pending)?.hash;
    }

    override changeDetected(ev: TreeOutputEvent<any>) {
        (BatchedOutput.pendingOuts[this.hash()] ??= []).remove(this as any);
        this.pending = ev.value;
        (BatchedOutput.pendingOuts[this.hash()] ??= []).push(this as any);
        return super.changeDetected(ev);
    }

    override settle(changeAttempt: number) {
        if (changeAttempt !== this.changeAttempts)
            return undefined;
        if (eq(this.val, this.pending))
            return undefined;
        
        const hash = this.hash();
        const batch = BatchedOutput.pendingOuts[hash] ?? [];
        delete BatchedOutput.pendingOuts[hash];
        for (const out of batch) {
            out.val = out.pending;
            out.lastValChange = time();
        }
        BatchedOutput.valOuts[hash] = batch.slice();
        Log.trace('machine', 'batch outputs %s settled on ', batch.map(o => o.name).join(','), this.val);
        return this.trySet();
    }

    abstract batchSet(val: T, outs: this[]): Promise<boolean|number>|boolean|number;

    override set(val: T): Promise<boolean|number>|boolean|number {
        const hash = this.type+"_"+(val)?.hash;
        return this.batchSet(val, BatchedOutput.valOuts[hash] as any);
    }

    override setSuccess(val: T) {
        const hash = this.type+"_"+(val)?.hash;
        const outs = BatchedOutput.valOuts[hash] ?? [];
        for (const out of outs) {
            super.setSuccess(val, out as any);
        }
        delete BatchedOutput.valOuts[hash];
    }
}
export abstract class Solenoid extends MachineOutput<boolean> {

    static firingUntil?: Time;

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
        public readonly ms = 25, // fire time
        public wait = 1000, // min time between fire attempts
        public fake?: () => void,
    ) {
        super(name, num, board);
    }

    async init() {
        if (this.num < 0) return;
        if (!machine.sDetect3.state) {
            Log.log(['mpu', 'solenoid'], 'skip initializing solenoid %s, no power', this.name);
            return;
        }
        Log.info(['machine', 'solenoid'], 'init %s as momentary, pulse %i', this.name, this.ms);
        await this.board.initMomentary(this.num, this.ms);
    }

    async fire(ms?: number): Promise<boolean|number> {
        if (this.num < 0) return true;
        if (this.lastFired && time() < this.lastFired + this.wait) {
            Log.trace(['machine', 'solenoid'], 'skip firing solenoid %s, too soon', this.name);
            return this.lastFired + this.wait - time() + 3 + Math.floor(Math.random()*10);
        }
        if (Solenoid.firingUntil) {
            if (time() <= Solenoid.firingUntil) {
                Log.info(['machine', 'solenoid', 'console'], 'skip firing solenoid %s, global too soon', this.name);
                return Solenoid.firingUntil - time() + Math.floor(Math.random()*10);
            }
            Solenoid.firingUntil = undefined;
        }

        this.lastFired = time();
        Solenoid.firingUntil = time() + (ms ?? this.ms)+100 + Math.floor(Math.random()*10) as Time;
        Log.log(['machine', 'solenoid'], 'fire solenoid %s for %i', this.name, ms ?? this.ms);
        Events.fire(new SolenoidFireEvent(this));

        if (!MPU.isLive && gfx && !curRecording && this.fake) void wait(100).then(() => this.fake!());
        if (ms)
            await this.board.fireSolenoidFor(this.num, ms);
        else
            await this.board.fireSolenoid(this.num);

        return (ms ?? this.ms) + this.wait + 3 + Math.floor(Math.random()*10);
    }

    async set(on: boolean) {
        if (on) return this.fire();
        return true;
    }

    onFire = (e: Event) => e instanceof SolenoidFireEvent && e.coil === this;
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
    tries = 0;

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

    override async fire(): Promise<boolean|number> {
        let fired: boolean|number = false;
        if (!this.lastFired)
            fired = await super.fire(this.initial);
        else {
            if (time() > (this.lastFired + this.resetPeriod)) {
                this.i = 0;
                this.tries = 0;
                fired = await super.fire(this.initial);
            } else {
                fired = await super.fire((this.max - this.initial)/(this.steps-1) * this.i + this.initial);
            }
        } 
        if (fired) {
            this.tries++;
            if (this.tries > this.steps+3)
            return true;
        }
        if (fired && this.i < this.steps - 1)
            this.i++;
        return fired;
    }
}

export class TriggerSolenoid extends MomentarySolenoid {
    constructor(
        name: keyof MachineOutputs,
        num: number,
        board: Solenoid16,
        public sw: Switch,
        ms = 25, // fire time
        wait = 1000, // min time between fire attempts
        fake?: () => void,
    ) {
        super(name, num, board, ms, wait, fake);
    }

    override async set(enabled: boolean): Promise<boolean|number> {
        if (enabled) 
            await this.board.send(`set-trigger ${this.sw.row} ${this.sw.column} #-1 ${this.board.board}: f ${this.num}`);
        else
            await this.board.send(`disable-trigger ${this.sw.row} ${this.sw.column}`);
        return true;
    }
}

export class Trigger extends MachineOutput<boolean> {
    constructor(
        name: keyof MachineOutputs,
        public sw: Switch,
        public cmd: string,
    ) {
        super(false, name);
    }

    override async init() {}

    override async set(enabled: boolean): Promise<boolean|number> {
        if (!MPU.isLive) return true;
        if (enabled) 
            await MPU.sendCommand(`set-trigger ${this.sw.row} ${this.sw.column} #-1 ${this.cmd}`);
        else
            await MPU.sendCommand(`disable-trigger ${this.sw.row} ${this.sw.column}`);
        return true;
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
        if (!machine.sDetect3.state) {
            Log.log(['mpu', 'solenoid'], 'skip initializing solenoid %s, no power', this.name);
            return;
        }
        Log.info(['machine', 'solenoid'], 'init %s as on off, max %i %i', this.name, this.maxOnTime, this.pulseOffTime);
        await this.board.initOnOff(this.num, this.maxOnTime, this.pulseOffTime, this.pulseOnTime);
    }

    async set(on: boolean) {
        

        if (!MPU.isLive && gfx && !curRecording && this.fake) void wait(100).then(() => this.fake!(on));
        if (on) {
            if (Solenoid.firingUntil) {
                if (time() <= Solenoid.firingUntil) {
                    Log.info(['machine', 'solenoid', 'console'], 'skip turning on solenoid %s, global too soon', this.name);
                    return Solenoid.firingUntil - time() + 1;
                }
                Solenoid.firingUntil = undefined;
            }
    
            Solenoid.firingUntil = time() + (this.pulseOffTime? this.maxOnTime! : 100)+0 as Time;
            Log.log(['machine', 'solenoid'], `turn ${this.name} ` + (on? 'on':'off'));
            await this.board.turnOnSolenoid(this.num);
        }
        else {
            Log.log(['machine', 'solenoid'], `turn ${this.name} ` + (on? 'on':'off'));
            await this.board.turnOffSolenoid(this.num);
        }
        return true;
    }

    async toggle() {
        return this.board.toggleSolenoid(this.num);
    }
}



export class Light extends MachineOutput<LightState[], LightOutputs> {
    nums!: number[];
    constructor(
        name: keyof LightOutputs,
        num?: OrArray<number>,
    ) {
        super([], name);
        this.nums = arrayify(num ?? []);
    }

    async init() {

    }

    async set(state: LightState[]): Promise<boolean> {
        if (!gfx) return true;
        await this.sync();
        if (!gfxLights) return false;
        const l = gfxLights[this.name];
        if (l?.l) {
            l.l!.set(state);
            return true;
        }
        return true;
    }

    lit(): boolean {
        return this.val.some(x => normalizeLight(x));
    }

    is(...colors: Color[]): boolean {
        return this.val.some(c => colors.includes(normalizeLight(c)?.color!));
    }

    color(): Color|undefined {
        return normalizeLight(this.val[0])?.color;
    }

    onChange(): EventTypePredicate<StateEvent<this, 'val'>> {
        return (e: Event) => e instanceof StateEvent
            && e.on === this
            && e.prop === 'val';
    }

    // eslint-disable-next-line complexity
    async sync() {
        const state = this.val;
        if (this.nums.length) {
            if (LPU.isConnected) {
                let cmd = '';
                const threadId = machine.lights.indexOf(this) + 1;
                Log.info('lpu', `Light: %s`, this.name);
                if (state.length) {
                    const states = state.map(normalizeLight).truthy();
                    let loopNeeded = states.length > 1;
                    for (const {color, type, freq} of states) {
                        switch (type) {
                            case "solid":
                                for (const num of this.nums)
                                    cmd += `\t\tfill 1,${colorToHex(color)?.slice(1)},${num},1\n`;
                                if (states.length>1)
                                    cmd += `\t\tdelay 500\n\n`;
                                break;
                            case "flashing":
                                for (const num of this.nums)
                                    cmd += `\t\tfill 1,${colorToHex(color)?.slice(1)},${num},1\n`;
                                cmd += `\t\tdelay ${(1000/freq/2).toFixed(0)}\n\n`;
                                for (const num of this.nums)
                                    cmd += `\t\tfill 1,000000,${num},1\n`;
                                cmd += `\t\tdelay ${(1000/freq/2).toFixed(0)}\n\n`;
                                loopNeeded = true;
                                // cmd += `\t\tblink 1,0,${colorToHex(color)?.slice(1)},${(1000/freq).toFixed(0)},3,${this.num},1\n\n`;
                                break;
                            case "pulsing":
                                for (const num of this.nums)
                                    cmd += `\t\tfill 1,${colorToHex(color)?.slice(1)},${num},1\n`;
                                for (const num of this.nums)
                                    cmd += `\t\tfade 1,255,0,15,${(1000/15/freq).toFixed(0)},${num},1\n`;
                                for (const num of this.nums)
                                    cmd += `\t\tfade 1,0,255,15,${(1000/15/freq).toFixed(0)},${num},1\n\n`;
                                loopNeeded = true;
                                break;
                        }
                    }
                    if (loopNeeded) {
                        cmd = `thread_start ${threadId}, 0\n\tdo\n`+cmd;
                        cmd += "\tloop\n";
                        cmd += "thread_stop\n";
                    }
                }
                else {
                    for (const num of this.nums)
                        cmd += `\t\tfill 1,000000,${num},1\n\n`;
                    cmd += `\t\tkill_thread ${threadId},0\n`;
                    for (const num of this.nums)
                        cmd += `\t\tfill 1,000000,${num},1\n\n`;
                }
                await LPU.sendCommand(cmd);
            }
            else if (MPU.isConnected) {
                Log.info('mpu', `Light: %s`, this.name);
                const states = state.map(normalizeLight).truthy();
                if (states.length) {
                    const parts = states.map(({color, type, freq, phase, dutyCycle}) => `${colorToHex(color)} ${type} ${freq} ${phase} ${dutyCycle}`);
                    for (const num of this.nums)
                        await MPU.sendCommand(`light ${states.length} ${num} `+parts.join(' '));
                }
                else {
                    for (const num of this.nums)
                        await MPU.sendCommand(`light 1 ${num} 000000 solid 1 0 0.5`);
                }
            }
        }
    }
}

const dispNumbers: { [T in keyof ImageOutputs]: number} = {
    iCenter1: 49,
    iCenter2: 52,
    iCenter3: 53,
    iUpper31: 39,
    iUpper32: 38,
    iUpper33: 37,
    iUpper21: 34,
    iUpper22: 35,
    iLeft1: 4,
    iLeft2: 5,
    iLeft3: 6,
    iLeft4: 7,
    iRight1: 9,
    iRight2: 12,
    iRight3: 13,
    iRight4: 14,
    iRight5: 15,
    iSS1: 8,
    iSS3: 17,
    iSS4: 25,
    iSS5: 24,
    iSS6: 41,
    iSpinner: 16,
    iRamp: 40,
};

export type ImageType = DisplayContent|undefined;
export class Image extends BatchedOutput<ImageType, ImageOutputs> {
    constructor(
        name: keyof ImageOutputs,
        public big = false,
    ) {
        super(dInvert(false), name, 'Image'+(big? '_160' : '_128'));
    }

    async init() {

    }

    get num() {
        return dispNumbers[this.name];
    }

    async batchSet(state: ImageType, outs: Image[]) {
        let success = true;
        Log.info('machine', 'batch set %s to %s', outs.map(o => o.name).join(','), state?.hash);
        for (const out of outs) {
            success &&= out.setGfx(state);
        }

        await Image.syncDisps(outs.map(o => o.num), state, this.actual);

        return success;
    }

    setGfx(state: ImageType): boolean {
        if (!gfx) return true;
        // await this.syncDisp(this.actual);
        if (!gfxImages) return false;
        const l = gfxImages[this.name];
        let ret = true;
        if (l?.l) {
            l.l!.set(state);
            ret = true;
        }
        return ret;
    }

    syncDisp() {
        return Image.syncDisps([this.num], this.actual);
    }

    static async syncDisps(nums: number[], state?: DisplayContent, old?: DisplayContent) {
        // Log.info('machine', 'sync disp %i', this.num);
        // return;
        // const l = gfxImages?.[this.name];

        const numStr = nums.join(' ')+' |';

        if (CPU.isConnected) {
            const cmds: string[] = [];
            let inverted = state?.inverted;
            // if (state?.off)
            //     cmds.push(`power ${numStr} false`);
            if (state) {
                if (state.color)
                    cmds.push(`clear ${numStr} ${colorToHex(state.color!)!.slice(1)}`);
                else
                    cmds.push(`clear ${numStr} ${colorToHex(Color.Black)!.slice(1)}`);
                
                if (state.images) {
                    for (const img of state.images) {
                        cmds.push(`image ${numStr} ${img}`);
                    }
                }
                if (state.text) {
                    for (const {x, y, size, text, vAlign} of state.text) {
                        cmds.push(`text ${numStr} ${x} ${y} ${size} ${vAlign} ${text}`);
                    }
                }
                if (old) { 
                    const oldState = dMany(old, dInvert(false));
                    const newState = dMany(state, dInvert(false));
                    if (eq(oldState, newState)) {
                        cmds.set([]);
                    }
                    if (old.inverted && !state.inverted)
                        inverted = false;
                }
                else 
                    inverted = false;
            }
            else {
                cmds.push(`clear ${numStr} ${colorToHex(Color.Black)!.slice(1)}`);
                inverted = false;
                // cmds.push(`power ${this.num} false`);
            }

            for (const cmd of cmds) {
                await CPU.sendCommand(cmd+(cmd===cmds.last()? '' : ' &'));
            }
            if (inverted !== undefined || !old) {
                await CPU.sendCommand(`invert ${numStr} ${inverted ?? false}`);
            }
            // if (old?.off && !state?.off)
            //     cmds.push(`power ${numStr} true`);
        }
    }
}

class MusicOutput extends MachineOutput<MusicType> {
    async init() {

    }

    async set(music: MusicType): Promise<boolean> {
        if (!music)
            await stopMusic();
        else {
            const file = typeof music==='string'? music : music[0];
            await playMusic(file, undefined, undefined, typeof music==='string'? true : music[1]);
        }
        return true;
    }
}

export type SkillshotAward = {
    switch: string;
    award: string;
    display?: ImageType;
    collect?: (e: SwitchEvent) => void; // always called for given switch
    made: (e: SwitchEvent) => void; // if selected skillshot was made
    select?: (selected: boolean, disp: Node, a: SkillshotAward) => void;
    dontOverride?: boolean;
    dontDefault?: boolean;
};

export type MusicType = string|[file: string, resume: boolean]|null;

export type MachineOutputs = CoilOutputs&LightOutputs&ImageOutputs&{
    getSkillshot?: (skillshot: Skillshot) => Partial<SkillshotAward>[];
    ignoreSkillsot: Set<Switch>;
    spinnerValue?: number;
    music: MusicType;
    ballSave: boolean;
    enableSkillshot: boolean;
};

export type CoilOutputs = {
    rampUp: boolean;
    upper3: boolean;
    outhole: boolean;
    troughRelease: boolean;
    miniEject: boolean;
    miniBank: boolean;
    miniDiverter: boolean;
    // magnetPost: boolean;
    leftBank: boolean;
    rightBank: boolean;
    realRightBank: boolean;
    centerBank: boolean;
    upper2: boolean;
    upperEject: boolean;
    lockPost: boolean;
    catcher: boolean;
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
    miniFlipperEnable: boolean;
    popperEnabled: boolean;
    miniTrigger: boolean;
};

export type LightOutputs = {
    lMiniReady: LightState[];
    lRampArrow: LightState[];
    lPower1: LightState[];
    lPower2: LightState[];
    lPower3: LightState[];
    lMagnet1: LightState[];
    lMagnet2: LightState[];
    lMagnet3: LightState[];
    lPopperStatus: LightState[];
    lLaneUpper1: LightState[];
    lLaneUpper2: LightState[];
    lLaneUpper3: LightState[];
    lLaneUpper4: LightState[];
    lSideShotArrow: LightState[];
    lEjectArrow: LightState[];
    lUpperLaneArrow: LightState[];
    lUpperTargetArrow: LightState[];
    lSpinnerArrow: LightState[];
    lLeftArrow: LightState[];
    lSideTargetArrow: LightState[];
    lMainTargetArrow: LightState[];
    lRampMini: LightState[];
    lShootAgain: LightState[];
    lLaneLower1: LightState[];
    lLaneLower2: LightState[];
    lLaneLower3: LightState[];
    lLaneLower4: LightState[];
    lSpinnerTarget: LightState[];
    lUpperLaneTarget: LightState[];
    lMiniBank: LightState[];
    lStraightStatus: LightState[];
    lFlushStatus: LightState[];
    lFullHouseStatus: LightState[];
};
export type ImageOutputs = {
    iCenter1: ImageType;
    iCenter2: ImageType;
    iCenter3: ImageType;
    iUpper31: ImageType;
    iUpper32: ImageType;
    iUpper33: ImageType;
    iUpper21: ImageType;
    iUpper22: ImageType;
    iLeft1: ImageType;
    iLeft2: ImageType;
    iLeft3: ImageType;
    iLeft4: ImageType;
    iRight1: ImageType;
    iRight2: ImageType;
    iRight3: ImageType;
    iRight4: ImageType;
    iRight5: ImageType;
    iSS1: ImageType;
    iSS3: ImageType;
    iSS4: ImageType;
    iSS5: ImageType;
    iSS6: ImageType;
    iSpinner: ImageType;
    iRamp: ImageType;
};


export class Machine extends Tree<MachineOutputs> {
    sLeftInlane = new Switch(1, 2, 'left inlane', 0, 100);
    sLeftOutlane = new Switch(1, 1, 'left outlane', 0, 100);
    sRightInlane = new Switch(0, 5, 'right inlane', LaneSet);
    sRightOutlane = new Switch(0, 4, 'right outlane', LaneSet);
    sMiniOut = new Switch(0, 3, 'mini out', Drain);
    sOuthole = new Switch(0, 2, 'outhole', [250, 50]);
    sTroughFull = new Switch(0, 1, 'trough full', Drain);
    sLeftSling = new Switch(1, 0, 'left sling', Bumper);
    sRightSling = new Switch(0, 7, 'right sling', Bumper);
    sMiniLeft = new Switch(1, 7, 'mini left', Drop);
    sMiniCenter = new Switch(1, 6, 'mini center', Drop);
    sMiniRight = new Switch(1, 5, 'mini right', Drop);
    sCenterLeft = new Switch(4, 3, 'center left', Drop);
    sCenterCenter = new Switch(4, 2, 'center center', Drop);
    sCenterRight = new Switch(4, 1, 'center right', Drop);
    sLeft1 = new Switch(3, 1, 'left 1', Drop);
    sLeft2 = new Switch(3, 2, 'left 2', Drop);
    sLeft3 = new Switch(3, 3, 'left 3', Drop);
    sLeft4 = new Switch(3, 5, 'left 4', Drop);
    sRight1 = new Switch(2, 5, 'right 1', Drop);
    sRight2 = new Switch(2, 4, 'right 2', Drop);
    sRight3 = new Switch(2, 3, 'right 3', Drop);
    sRight4 = new Switch(2, 2, 'right 4', Drop);
    sRight5 = new Switch(2, 1, 'right 5', Drop);
    sLeftBack1 = new Switch(3, 4, 'left back 1', StandupSet);
    sLeftBack2 = new Switch(3, 6, 'left back 2', StandupSet);
    sUpper3Left = new Switch(5, 2, 'upper 3 left', Drop);
    sUpper3Center = new Switch(5, 1, 'upper 3 center', Drop);
    sUpper3Right = new Switch(5, 0, 'upper 3 right', Drop);
    sUpper2Left = new Switch(6, 4, 'upper 2 left', Drop);
    sUpper2Right = new Switch(6, 3, 'upper 2 right', Drop);
    sSingleStandup = new Switch(7, 3, 'single standup', StandupSet);
    sRampMini = new Switch(3, 7, 'ramp mini', StandupSet);
    sRampMiniOuter = new Switch(3, 0, 'ramp mini outer', StandupSet);
    sRampDown = new Switch(7, 4, 'ramp down');
    sLeftOrbit = new Switch(7, 2, 'left orbit', 0, 300);
    sSpinner = new Switch(6, 6, 'spinner', 0, 1);
    sSpinnerMini = new Switch(6, 2, 'spinner mini', StandupSet);
    sUpperPopMini = new Switch(6, 7, 'upper pop mini', StandupSet);
    sSidePopMini = new Switch(6, 0, 'side pop mini', StandupSet);
    sShooterUpper = new Switch(2, 6, 'shooter upper', LaneSet);
    sShooterMagnet = new Switch(2, 7, 'shooter magnet', LaneSet);
    sShooterLane = new Switch(0, 0, 'shooter lane', 100, 10);
    sShooterLower = new Switch(2, 0, 'shooter lower', 0, 50);
    sBackLane = new Switch(5, 5, 'back lane', [0, 100]);
    sUpperInlane = new Switch(7, 1, 'upper inlane', 0, 50); 
    sUnderUpperFlipper = new Switch(7, 5, 'under upper flipper', StandupSet);
    sUpperSideTarget = new Switch(6, 1, 'upper side target', StandupSet);
    sUpperEject = new Switch(7, 6, 'upper eject', Hole);
    sUpperLane2 = new Switch(6, 5, 'upper lane 2', 1, 50);
    sUpperLane3 = new Switch(5, 7, 'upper lane 3', 1, 50);
    sUpperLane4 = new Switch(5, 3, 'upper lane 4', 1, 50);
    sRampMade = new Switch(7, 0, 'ramp made', [0, 150]);
    sPopperButton = new Switch(5, 8, 'popper button', 1, 50);
    sMagnetButton = new Switch(6, 8, 'magnet button', 1, 50);
    sLeftFlipper = new Switch(4, 8, 'left flipper', 1, 50);
    sRightFlipper = new Switch(1, 8, 'right flipper', 1, 50);
    sStartButton = new Switch(0, 8, 'start button', 1, 50);
    sActionButton = new Switch(3, 8, 'action button', 25, 100);
    sBothFlippers = new Switch(1, 15, 'both flippers', 1, 50, false, false, true);
    sTilt = new Switch(2, 8, 'tilt', 1, 100);
    sDetect3 = new Switch(0, 15, '3v detect', 100, 100);


    solenoidBank1 = new Solenoid16(0);
    cOuthole = new IncreaseSolenoid('outhole', 0, this.solenoidBank1, 55, 75, 4, undefined, undefined, () => {this.sOuthole.changeState(false, 'fake'); if (this.ballsInTrough===3) this.sTroughFull.changeState(true, 'fake'); });
    cTroughRelease = new IncreaseSolenoid('troughRelease', 1, this.solenoidBank1, 500, 2000, 3, 3000, undefined, () => { this.sTroughFull.changeState(false, 'fake'); this.sShooterLane.changeState(true, 'fake') });
    cPopper = new TriggerSolenoid('popper', 2, this.solenoidBank1, this.sPopperButton, 70, 1000);
    cMiniDiverter = new OnOffSolenoid('miniDiverter', 4, this.solenoidBank1, 150, 20, 10);
    cShooterDiverter = new OnOffSolenoid('shooterDiverter', 5, this.solenoidBank1);
    // cMagnetPost = new OnOffSolenoid('magnetPost', 6, this.solenoidBank1);
    cLeftBank = new IncreaseSolenoid('leftBank', 7, this.solenoidBank1, 60, 100, undefined, undefined, undefined, () => [this.sLeft1, this.sLeft2, this.sLeft3, this.sLeft4].forEach(t => t.changeState(false, 'fake')));
    cCenterBank = new IncreaseSolenoid('centerBank', 8, this.solenoidBank1, 60, 100, undefined, undefined, undefined, () => [this.sCenterLeft, this.sCenterCenter, this.sCenterRight].forEach(t => t.changeState(false, 'fake')));
    cLeftMagnet = new OnOffSolenoid('leftMagnet', 9, this.solenoidBank1, 5000);
    cLockPost = new OnOffSolenoid('lockPost', 10, this.solenoidBank1, 100, 30, 5);
    cRamp = new OnOffSolenoid('rampUp', 11, this.solenoidBank1, 100, 15, 10, on => this.sRampDown.state = !on);
    cMiniEject = new IncreaseSolenoid('miniEject', 12, this.solenoidBank1, 50, 100, 4, 1000, 5000);
    cMiniBank = new IncreaseSolenoid('miniBank', 14, this.solenoidBank1, 60, 130, undefined, undefined, undefined, () => [this.sMiniLeft, this.sMiniRight, this.sMiniCenter].forEach(t => t.changeState(false, 'fake')));
    cMiniFlipper = new OnOffSolenoid('miniFlipperEnable', 15, this.solenoidBank1);

    solenoidBank2 = new Solenoid16(2);
    cUpper2 = new IncreaseSolenoid('upper2', 10, this.solenoidBank2, 50, 100, undefined, undefined, undefined, () => [this.sUpper2Left, this.sUpper2Right].forEach(t => t.changeState(false, 'fake')));
    cUpper3 = new IncreaseSolenoid('upper3', 12, this.solenoidBank2, 40, 100, undefined, undefined, undefined, () => [this.sUpper3Left, this.sUpper3Center, this.sUpper3Right].forEach(t => t.changeState(false, 'fake')));
    cUpperEject = new IncreaseSolenoid('upperEject', 11, this.solenoidBank2, 8, 20, 9, 500, undefined, () => machine.sUpperEject.changeState(false, 'fake'));
    cLeftGate = new OnOffSolenoid('leftGate', 8, this.solenoidBank2, 25, 50, 8);
    cRightGate = new OnOffSolenoid('rightGate', 9, this.solenoidBank2);
    cRealRightBank = new IncreaseSolenoid('realRightBank', 6, this.solenoidBank2, 30, 100, undefined, undefined, undefined, () => [this.sRight1, this.sRight2, this.sRight3, this.sRight4, this.sRight5].forEach(t => t.changeState(false, 'fake')));
    cRightBank = new MomentarySolenoid('rightBank', -1, this.solenoidBank2);
    cRightDown1 = new IncreaseSolenoid('right1', 0, this.solenoidBank2, 35, 60, 3, 500, undefined, () => this.sRight1.changeState(true, 'fake'));
    cRightDown2 = new IncreaseSolenoid('right2', 1, this.solenoidBank2, 35, 60, 3, 500, undefined, () => this.sRight2.changeState(true, 'fake'));
    cRightDown3 = new IncreaseSolenoid('right3', 2, this.solenoidBank2, 35, 60, 3, 500, undefined, () => this.sRight3.changeState(true, 'fake'));
    cRightDown4 = new IncreaseSolenoid('right4', 4, this.solenoidBank2, 35, 60, 3, 500, undefined, () => this.sRight4.changeState(true, 'fake'));
    cRightDown5 = new IncreaseSolenoid('right5', 5, this.solenoidBank2, 35, 60, 3, 500, undefined, () => this.sRight5.changeState(true, 'fake'));
    cRightDown = [this.cRightDown1, this.cRightDown2, this.cRightDown3, this.cRightDown4, this.cRightDown5];
    cKickerEnable = new OnOffSolenoid('kickerEnable', 14, this.solenoidBank2);
    cCatcher = new OnOffSolenoid('catcher', 7, this.solenoidBank2, 100, 30, 10);
    tMiniTrigger = new Trigger('miniTrigger', this.sLeftOutlane, '0: on 4');

    pfSwitches = [
        this.sMiniOut,
        this.sOuthole,
        this.sLeftInlane,
        this.sLeftOutlane,
        this.sRightInlane,
        this.sRightOutlane,
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
        this.sUpper3Left,
        this.sUpper3Center,
        this.sUpper3Right,
        this.sUpper2Left,
        this.sUpper2Right,
        this.sSingleStandup,
        this.sRampMini,
        this.sRampMiniOuter,
        this.sLeftOrbit,
        // this.sSpinner,
        this.sSpinnerMini,
        this.sUpperPopMini,
        this.sSidePopMini,
        this.sShooterUpper,
        this.sShooterMagnet,
        this.sShooterLower,
        this.sBackLane,
        this.sUpperInlane,
        this.sUnderUpperFlipper,
        this.sUpperSideTarget,
        this.sUpperEject,
        this.sUpperLane2,
        this.sUpperLane3,
        this.sUpperLane4,
        this.sRampMade,
    ];

    sUpperLanes = [
        this.sBackLane,
        this.sUpperLane2,
        this.sUpperLane3,
        this.sUpperLane4,
    ];

    sLowerlanes = [
        this.sLeftInlane,
        this.sLeftOutlane,
        this.sRightInlane,
        this.sRightOutlane,
    ];

    sLanes = [
        ...this.sUpperLanes,
        ...this.sLowerlanes,
    ];

    sStandups = [
        this.sRampMini, this.sRampMiniOuter, this.sSpinnerMini, this.sSidePopMini, this.sUpperPopMini, this.sSingleStandup,
    ];

    lastSwitchHit?: Switch;

    lMiniReady = new Light('lMiniReady', 148);
    lMiniBank = new Light('lMiniBank', 145);
    lStraightStatus = new Light('lStraightStatus', 132);
    lFlushStatus = new Light('lFlushStatus', 130);
    lFullHouseStatus = new Light('lFullHouseStatus', 128);
    lRampArrow = new Light('lRampArrow', [62, 61]);
    lPower1 = new Light('lPower1', 100);
    lPower2 = new Light('lPower2', 102);
    lPower3 = new Light('lPower3', 103);
    lMagnet1 = new Light('lMagnet1', 77);
    lMagnet2 = new Light('lMagnet2', 79);
    lMagnet3 = new Light('lMagnet3', 80);
    lPopperStatus = new Light('lPopperStatus', 117);
    lLaneUpper1 = new Light('lLaneUpper1', 6);
    lLaneUpper2 = new Light('lLaneUpper2', 10);
    lLaneUpper3 = new Light('lLaneUpper3', 12);
    lLaneUpper4 = new Light('lLaneUpper4', 14);
    lSideShotArrow = new Light('lSideShotArrow', 50);
    lEjectArrow = new Light('lEjectArrow', [43, 44]);
    lUpperLaneArrow = new Light('lUpperLaneArrow', 39);
    lUpperTargetArrow = new Light('lUpperTargetArrow', 35);
    lSpinnerArrow = new Light('lSpinnerArrow', [29, 28]);
    lLeftArrow = new Light('lLeftArrow', 66);
    lSideTargetArrow = new Light('lSideTargetArrow', 52);
    lRampMini = new Light('lRampMini', 64);
    lMainTargetArrow = new Light('lMainTargetArrow', 55);
    lShootAgain = new Light('lShootAgain', 109);
    lLaneLower1 = new Light('lLaneLower1', 89);
    lLaneLower2 = new Light('lLaneLower2', 87);
    lLaneLower3 = new Light('lLaneLower3', 126);
    lLaneLower4 = new Light('lLaneLower4', 125);
    lSpinnerTarget = new Light('lSpinnerTarget', 33);
    lUpperLaneTarget = new Light('lUpperLaneTarget', 37);

    swLights = new Map<Switch, Light>([
        [this.sSingleStandup, this.lMainTargetArrow],
        [this.sBackLane, this.lUpperLaneArrow],
        [this.sUpperLane2, this.lLaneUpper2],
        [this.sUpperLane3, this.lLaneUpper3],
        [this.sUpperLane4, this.lLaneUpper4],
        [this.sLeftInlane, this.lLaneLower1],
        [this.sLeftOutlane, this.lLaneLower2],
        [this.sRightInlane, this.lLaneLower3],
        [this.sRightOutlane, this.lLaneLower4],
        [this.sLeftOrbit, this.lRampArrow],
        [this.sRampMade, this.lRampArrow],
        [this.sRampMini, this.lRampMini],
        [this.sRampMiniOuter, this.lLeftArrow],
        [this.sSidePopMini, this.lUpperTargetArrow],
        [this.sSpinnerMini, this.lSpinnerTarget],
        [this.sUnderUpperFlipper, this.lSideTargetArrow],
        [this.sUpperPopMini, this.lUpperLaneTarget],
    ]);

    oMusic = new MusicOutput(null, 'music');

    iSS1 = new Image('iSS1', true);
    iSS3 = new Image('iSS3');
    iSS4 = new Image('iSS4', true);
    iSS5 = new Image('iSS5', true);
    iSS6 = new Image('iSS6');
    iSpinner = new Image('iSpinner', true);
    iRamp = new Image('iRamp', true);

    dropTargets: DropTarget[] = [];
    allDropTargets: DropTarget[] = [];
    dropBanks: DropBank[] = [];

    standups: Standup[] = [
        [this.sRampMiniOuter, this.lLeftArrow],
        [this.sRampMini, this.lRampMini],
        [this.sSingleStandup, this.lMainTargetArrow],
        [this.sSidePopMini, this.lUpperTargetArrow],
        [this.sUpperPopMini, this.lUpperLaneTarget],
    ];

    upperLanes: Lane[] = [
        {sw: this.sBackLane, light: this.lLaneUpper1, isLane: true},
        {sw: this.sUpperLane2, light: this.lLaneUpper2, isLane: true},
        {sw: this.sUpperLane3, light: this.lLaneUpper3, isLane: true},
        {sw: this.sUpperLane4, light: this.lLaneUpper4, isLane: true},
    ];

    lowerLanes: Lane[] = [
        {sw: this.sLeftInlane, light: this.lLaneLower1, isLane: true},
        {sw: this.sLeftOutlane, light: this.lLaneLower2, isLane: true},
        {sw: this.sRightInlane, light: this.lLaneLower3, isLane: true},
        {sw: this.sRightOutlane, light: this.lLaneLower4, isLane: true},
    ];
    orbitShot: Shot = {sw: this.sLeftOrbit, light: this.lRampArrow, isShot: true};
    rampShot: Shot = {sw: this.sRampMade, light: this.lRampArrow, isShot: true};
    ejectShot: Shot = {sw: this.sUpperEject, light: this.lEjectArrow, isShot: true};
    spinnerShot: Shot = {sw: this.sSpinner, light: this.lSpinnerArrow, isShot: true};
    shots: Shot[] = [
        this.orbitShot,
        this.rampShot,
        this.ejectShot,
        this.spinnerShot,
    ];

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
        [17, 18, 19]);
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

    game?: Game;
    attract?: AttractMode;
    overrides!: MachineOverrides;

    override get nodes() {
        return [
            ...this.dropBanks,
            this.attract,
            this.game,
            ...this.tempNodes,
            this.overrides,
        ].truthy();
    }

    lockDown = false;
    miniDownUntil?: Time = undefined;
    ballsInTrough: 3|'unknown' = 'unknown';
    ballsLocked: 0|1|2|3|'unknown' = 'unknown';
    get ballsInPlay(): 0|1|2|3|'unknown' {
        if (this.ballsInTrough === 'unknown' || this.ballsLocked === 'unknown')
            return 'unknown';
        return 3 - this.ballsLocked - this.ballsInTrough as any;
    }
    constructor() {
        super();
        this.makeRoot();
        State.declare<Machine>(this, ['lockDown', 'miniDownUntil', 'lastSwitchHit', 'ballsInTrough', 'ballsLocked', 'game']);

        this.out = new Outputs<MachineOutputs>(this, {
            rampUp: false,
            upper3: false,
            outhole: false,
            troughRelease: false,
            miniEject: false,
            miniBank: false,
            miniFlipperEnable: false,
            miniDiverter: () => !!this.miniDownUntil && time() < this.miniDownUntil,
            leftBank: false,
            rightBank: false,
            realRightBank: false,
            centerBank: false,
            upper2: false,
            upperEject: false,
            lockPost: () => this.lockDown,//this.sRampMade.wasClosedWithin(50),
            catcher: false,
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
            popperEnabled: false,
            miniTrigger: () => !this.lMiniReady.is(Color.Red) && this.lMiniReady.lit() && this.cKickerEnable.actual,
            // magnetPost: false,
            // temp: () => 0,
            lMiniReady: [Color.Red],
            lMiniBank: [],
            lStraightStatus: [],
            lFlushStatus: [],
            lFullHouseStatus: [],
            lRampArrow: [],
            lPower1: [],
            lPower2: [],
            lPower3: [],
            lMagnet1: () => this.lPower1.lit()? [{...{...normalizeLight(this.lPower1.val[0]), color: Color.Green}, ...!this.cLeftMagnet.actual? {type: 'solid'} : {}} as NormalizedLight] : [],
            lMagnet2: () => this.lPower2.lit()? [{...{...normalizeLight(this.lPower2.val[0]), color: Color.Green}, ...!this.cLeftMagnet.actual? {type: 'solid'} : {}} as NormalizedLight] : [],
            lMagnet3: () => this.lPower3.lit()? [{...{...normalizeLight(this.lPower3.val[0]), color: Color.Green}, ...!this.cLeftMagnet.actual? {type: 'solid'} : {}} as NormalizedLight] : [],
            lPopperStatus: [],
            lLaneUpper1: [],
            lLaneUpper2: [],
            lLaneUpper3: [],
            lLaneUpper4: [],
            lSideShotArrow: [],
            lEjectArrow: [],
            lUpperLaneArrow: [],
            lUpperTargetArrow: [],
            lSpinnerArrow: [],
            lLeftArrow: [],
            lSideTargetArrow: [],
            lMainTargetArrow: [],
            lShootAgain: [],
            lRampMini: [],
            lLaneLower1: [],
            lLaneLower2: [],
            lLaneLower3: [],
            lLaneLower4: [],
            lSpinnerTarget: [],
            lUpperLaneTarget: [],
            iCenter1: undefined,
            iCenter2: undefined,
            iCenter3: undefined,
            iUpper31: undefined,
            iUpper32: undefined,
            iUpper33: undefined,
            iUpper21: undefined,
            iUpper22: undefined,
            iLeft1: undefined,
            iLeft2: undefined,
            iLeft3: undefined,
            iLeft4: undefined,
            iRight1: undefined,
            iRight2: undefined,
            iRight3: undefined,
            iRight4: undefined,
            iRight5: undefined,
            iSS1: undefined,
            iSS3: undefined,
            iSS4: undefined,
            iSS5: undefined,
            iSS6: undefined,
            iSpinner: undefined,
            iRamp: undefined,
            getSkillshot: undefined,
            ignoreSkillsot: new Set(),
            spinnerValue: undefined,
            music: null,
            ballSave: false,
            enableSkillshot: true,
        });

        this.listen(onSwitchClose(this.sTroughFull), () => {
            this.ballsInTrough = 3;
            this.ballsLocked = 0;
        });
        this.listen(this.cTroughRelease.onFire, () => {
            if (this.ballsInTrough !== 'unknown')
                this.ballsInTrough--;
        });
        this.listen([this.cOuthole.onFire, () => this.sOuthole.state], () => {
            if (this.ballsInTrough !== 'unknown')
                this.ballsInTrough++;
        });
    

        this.listen(onSwitchClose(this.sRampMade), () => this.lockDown = true);
        this.listen(onAnyPfSwitchExcept(this.sRampMade), () => this.lockDown = false);

        this.listen([...onSwitchClose(this.sLeftOutlane), () => !this.out!.treeValues.lMiniReady.includes(Color.Red)], () => {
            this.miniDownUntil = time() + 2000 as Time;
        });
        // this.listen([onAnySwitchClose(this.sOuthole), () => this.miniDown = false);

        this.listen<SwitchEvent>([onAny(onAnyPfSwitchExcept(), onSwitchClose(this.sSpinner)), e => e.sw!==machine.sOuthole] , e => this.lastSwitchHit = e.sw);

        this.listen(onAny(onSwitch(this.sLeftFlipper), onSwitch(this.sRightFlipper)), () => {
            this.sBothFlippers.changeState(this.sLeftFlipper.state && this.sRightFlipper.state, 'sim', Math.max(this.sLeftFlipper.lastChange, this.sRightFlipper.lastChange) as Time);
        });

        this.listen(onAnySwitchClose(...this.standups.map(([sw]) => sw)), (e) => Events.fire(new StandupEvent(this.standups.find(([sw]) => e.sw === sw)!)));

        this.listen([...onSwitchClose(this.sPopperButton), () => this.sBothFlippers.state], () => this.out!.debugPrint());

        this.overrides = new MachineOverrides(this);
        
        this.watch(() => screen?.circle.x(time()%1000-500));

        this.listen(onSwitchClose(this.sDetect3), async () => {
            if (!MPU.isLive) return;
            Log.log(['console', 'machine'], 'power detected, initializing boards...');
            alert('Initializing...', 3000);
            await Promise.all([
                (async () => {
                    if (CPU.isConnected) {
                        await CPU.sendCommand("init");
                        await CPU.syncDisplays();
                        Log.log(['console', 'machine'], 'displays initialized');
                    }
                })(),
                (async () => {
                    for (const board of this.boards) {
                        await board.init();
                    }
                    for (const s of this.coils) {
                        await s.init();
                        Solenoid.firingUntil = undefined;
                        await s.set(s.val);
                        // await wait(150);
                    }
                    Log.log(['console', 'machine'], 'drivers initialized');
                })(),
            ]);
            Log.log(['console', 'machine'], 'init complete');
            alert('Done!', 1000);
        });
        this.listen(onSwitchOpen(this.sDetect3), () => Log.log(['console', 'machine'], 'power lost'));
    }

    pfIsInactive(): boolean {
        return [this.lastSwitchHit, this.sLeftFlipper, this.sShooterLane, this.sTroughFull, this.sRightFlipper, this.sPopperButton, this.sMagnetButton, this.sActionButton]
            .truthy().every(sw => sw.noActivityFor(60000))
            ;
            // && (!SwitchEvent.last || SwitchEvent.last.sw===this.sRampDown || time() - SwitchEvent.last.when > 30000);
    }

    get lights(): Light[] {
        return Object.keys(this).map(key => (this as any)[key]).filter(o => o instanceof Light);
    }

    get boards(): Solenoid16[] {
        return Object.keys(this).map(key => (this as any)[key]).filter(o => o instanceof Solenoid16);
    }

    get coils(): Solenoid[] {
        return Object.keys(this).map(key => (this as any)[key]).filter(o => o instanceof Solenoid);
    }
}

export class StandupEvent extends Event {
    constructor(
        public standup: Standup,
    ) {
        super();
    }
}


export function expectMachineOutputs(...names: (keyof MachineOutputs)[]): jest.SpyInstance[] {
    const ret = [];
    for (const out of getTypeIn<MachineOutput<any>>(machine, MachineOutput)) {
        if (names.includes(out.name)) {
            ret.push(jest.spyOn(out, 'set').mockResolvedValue(true));
        }
    }

    return ret;
}

class MachineOverrides extends Mode {
    eosPulse = new EosPulse(this.machine.cRamp, this.machine.sRampDown);
    searchTimer?: TimerQueueEntry;
    curBallSearch?: number;

    override get nodes() {
        return [this.eosPulse, ...this.tempNodes];
    }

    constructor(public machine: Machine) {
        super(Modes.MachineOverrides);
        const outs: any  = {};
        for (const target of machine.dropTargets) {
            if (!target.image) continue;
            // outs[target.image.name] = (prev: any) => machine.pfIsInactive()? dOff() : prev;
        }
        this.out = new Outputs(this, {
            ...outs,
            realRightBank: () => machine.out!.treeValues.rightBank &&
                !machine.cShooterDiverter.actual && time()-(machine.cShooterDiverter.lastActualChange??0) > 500,
            rampUp: () => machine.pfIsInactive()? false : undefined,
            shooterDiverter: () => machine.out!.treeValues.rightBank || machine.pfIsInactive()? false : undefined,
            leftGate: () => machine.pfIsInactive()? false : undefined,
            rightGate: () => machine.pfIsInactive()? false : undefined,
            lockPost: () => machine.pfIsInactive()? false : undefined,
            miniDiverter: () => machine.pfIsInactive()? false : undefined,
            kickerEnable: () => machine.sActionButton.state || undefined,
        });
        
        this.listen(e => e instanceof SolenoidFireEvent && e.coil === machine.cRealRightBank, () => Events.fire(new SolenoidFireEvent(machine.cRightBank)));

        


        this.listen(e => e instanceof SwitchEvent && ![machine.sRampDown].includes(e.sw), 'updateBallSearch');
        this.listen(onChange(machine, 'ballsLocked'), 'updateBallSearch');
    }

    updateBallSearch() {
        const ballSearchTime = 10000;
        
        this.curBallSearch = undefined;

        const traps = [
            machine.sLeftFlipper,
            machine.sRightFlipper,
            machine.sOuthole,
            machine.sMiniOut,
            machine.sTroughFull,
            machine.sShooterLane,
            machine.sUpperEject,
        ];
        if (this.searchTimer) {
            Timer.cancel(this.searchTimer);
            this.searchTimer = undefined;
        }
        
        if (!traps.some(sw => sw.state) && !this.curBallSearch && MPU.isLive && (machine.ballsLocked===0 || machine.ballsLocked==='unknown')) {
            const ballSearchNum = this.curBallSearch = Math.random();
            this.searchTimer = Timer.callIn(async () => {
                for (let i=0; i<3; i++) {
                    if (this.curBallSearch !== ballSearchNum) return;
                    alert(`BALL SEARCH ${i+1}/3`);
                    fork(FireCoil(this, machine.cKickerEnable, 3000));
                    await FireCoil(this, machine.cShooterDiverter, 500, false);
                    if (machine.ballsLocked==='unknown' || machine.ballsLocked<1 || i===2)
                        await FireCoil(this, machine.cLockPost, 500);
                    fork(FireCoil(this, machine.cLockPost, 500, false));
                    await wait(1000);
                    if (this.curBallSearch !== ballSearchNum) return;
                    await FireCoil(this, machine.cMiniDiverter, 500);
                    fork(FireCoil(this, machine.cMiniDiverter, 500, false));
                    await FireCoil(this, machine.cRamp, 500);
                    fork(FireCoil(this, machine.cRamp, 500, false));
                    await FireCoil(this, machine.cUpperEject);
                    await FireCoil(this, machine.cMiniEject);
                    await FireCoil(this, machine.cOuthole); 
                    await wait(1000);
                    if (this.curBallSearch !== ballSearchNum) return;
                    for (const bank of machine.dropBanks) {
                        if (bank === machine.rightBank)
                            fork(FireCoil(this, machine.cShooterDiverter, 500, false));
                        await FireCoil(this, bank.coil, 50);
                        await wait(100);
                    }
                    await wait(2000);
                    if (this.curBallSearch !== ballSearchNum) return;
                }
            }, ballSearchTime, 'ball search ready');
        }
    }

    override end() {
        Timer.cancel(this.searchTimer);
        return super.end();
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
    Solenoid.firingUntil = undefined;

    return machine;
}
export let machine: Machine;
