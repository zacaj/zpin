import { MachineOutputs, machine, Machine } from '../machine';
import { Mode, Modes } from '../mode';
import { Poker, Card } from './poker';
import { State, onChange } from '../state';
import { Game } from '../game';
import { Outputs } from '../outputs';
import { Color, colorToArrow, light } from '../light';
import { onSwitchClose, onAnySwitchClose, onAnyPfSwitchExcept, onSwitch } from '../switch-matrix';
import { DropBankCompleteEvent, DropDownEvent, DropBankResetEvent, DropBank, DropTarget } from '../drop-bank';
import { Ball } from './ball';
import { Tree } from '../tree';
import { Event, Events, Priorities } from '../events';
import { Time, time, Timer, TimerQueueEntry, wait } from '../timer';
import { makeText, gfx, screen, addToScreen, alert, notify, pfx, textBox } from '../gfx';
import { StraightMb } from './straight.mb';
import { Multiball } from './multiball';
import { fork } from '../promises';
import { PlayerGfx } from '../gfx/player';
import { ClearHoles, ResetBank, ResetMechs } from '../util-modes';
import { assert, comma, getCallerLine, getCallerLoc, money, score, seq } from '../util';
import { Rng } from '../rand';
import { MPU } from '../mpu';
import { GameMode } from './game-mode';
import { Restart } from './restart';
import { HandMb } from './hand.mb';
import { Group, Text } from 'aminogfx-gl';
import { FullHouseMb } from './full-house.mb';
import { playSound } from '../sound';
const argv = require('yargs').argv;

export class Player extends Mode {
    chips = 2;
    _score = 0;
    get score() {
        return this._score;
    }
    set score(val: number) {
        if (this.ball?.tilted) return;
        const diff = val - this._score;
        this._score = val;

        if (diff) {
            const source = getCallerLine();
            this.recordScore(diff, source);
        }
    }
    addScore(amount: number, source: string|null) {
        if (this.ball?.tilted) return;
        this._score += amount;
        if (source && amount)
            this.recordScore(amount, source);
    }
    recordScore(amount: number, source: string) {
        if (!this.game.totals[source])
            this.game.totals[source] = {times: 0, total: 0, average: 0};
        this.game.totals[source].times++;
        this.game.totals[source].total += amount;
        this.game.totals[source].average = this.game.totals[source].total / this.game.totals[source].times;
    }
    miniReady = false;

    laneChips = [true, true, true, true];
    
    get curMbMode(): Multiball|undefined {
        if (this.focus instanceof Multiball) return this.focus;
        return undefined;
    }
    get poker(): Poker|undefined {
        if (this.focus instanceof Poker) return this.focus;
        return undefined;
    }
    get noMode(): NoMode|undefined {
        if (this.focus instanceof NoMode) return this.focus;
        return undefined;
    }
    get curMode() {
        return this.poker ?? this.curMbMode;
    }
    focus?: Poker|Multiball|NoMode;

    clearHoles = new ClearHoles();
    spinner = new Spinner(this);
    leftOrbit = new LeftOrbit(this);
    overrides = new PlayerOverrides(this);
    rampCombo?: RampCombo;
    ball?: Ball;

    get nodes() {
        return [
            this.clearHoles,
            this.ball,
            this.rampCombo,
            this.spinner,
            this.leftOrbit,
            this.focus,
            ...this.tempNodes,
            this.overrides,
        ].filter(x => !!x) as Tree<MachineOutputs>[];
    }

    modesQualified = new Set<(number)>();
    mbsQualified = new Map<'StraightMb'|'FlushMb'|'HandMb'|'FullHouseMb', Card[]>([
        // ['HandMb', []],
        // ['StraightMb', []],
        // ['FullHouseMb', []],
    ]);

    selectedMb?: 'StraightMb'|'FlushMb'|'HandMb'|'FullHouseMb';

    get modesReady() {
        return new Set([...this.modesQualified, ...(this.poker?.newModes ?? [])]);
    }
    get mbsReady() {
        return new Map([...this.mbsQualified, ...(this.poker?.newMbs ?? [])]);
    }
    rand!: Rng;

    closeShooter = false;

    mbColor(): Color {
        if (this.selectedMb === 'HandMb')
            return Color.Green;
        if (this.selectedMb === 'FullHouseMb')
            return Color.Yellow;
        else return Color.Blue;
    }

    constructor(
        public game: Game,
        public number: number,
        public seed = argv.seed ?? 'pinball',
    ) {
        super(Modes.Player);
        this.rand = this.rng();
        State.declare<Player>(this, ['miniReady', '_score', 'ball', 'chips', 'modesQualified', 'selectedMb', 'mbsQualified', 'focus', 'closeShooter', 'laneChips']);
        State.declare<Player['store']>(this.store, ['Poker', 'StraightMb', 'Skillshot']);
        this.out = new Outputs(this, {
            leftMagnet: () => machine.sMagnetButton.state && time() - machine.sMagnetButton.lastChange < 4000 && !machine.sShooterLane.state && machine.out!.treeValues.kickerEnable,
            rampUp: () => machine.lRampStartMb.is(Color.Red) || !machine.lRampStartMb.lit(),
            lShooterStartHand: () => (!this.curMode && !this.store.Poker?.wasQuit) || (this.poker?.step??-1) >= 7? [[Color.Green, 'fl']] : [],
            lEjectStartMode: () => (!this.curMode || this.poker) && this.modesReady.size>0? ((this.poker?.step??7) >= 7? [Color.Green] : [Color.Red]) : [],
            lRampStartMb: () => (!this.curMode || this.poker) && this.mbsReady.size>0? ((this.poker?.step??7) >= 7? [[this.mbColor(), 'fl']] : [Color.Red]) : [],
            lPower1: () => light(this.chips>=1, Color.Orange),
            lPower2: () => light(this.chips>=2, Color.Orange),
            lPower3: () => light(this.chips>=3, Color.Orange),
            lPower4: () => light(this.chips>=4, Color.Orange),
            lPopperStatus: () => light(this.chips>=1, Color.Green, Color.Red),
            shooterDiverter: () => machine.lShooterStartHand.lit()? true : undefined,
            lLaneUpper1: () => light(this.laneChips[0], Color.Orange),
            lLaneUpper2: () => light(this.laneChips[1], Color.Orange),
            lLaneUpper3: () => light(this.laneChips[2], Color.Orange),
            lLaneUpper4: () => light(this.laneChips[3], Color.Orange),
            lMiniReady: () => this.miniReady? [Color.Green] : [Color.Red],
            lRampMini: [Color.Orange],
        });
        

        // natural inlane -> lower ramp
        this.listen(
            [...onSwitchClose(machine.sRightInlane), () => !machine.sShooterLower.wasClosedWithin(2000) && !machine.sShooterMagnet.wasClosedWithin(2000)],
            e => {
                if (!this.rampCombo) {
                    this.rampCombo = new RampCombo(this);
                    this.rampCombo.started();
                }
            });

        // lane change
        this.listen(onAnySwitchClose(machine.sLeftFlipper),
            e => {
                this.laneChips.rotate(-1);
            });
        this.listen(onAnySwitchClose(machine.sRightFlipper),
            e => {
                this.laneChips.rotate(1);
            });


        // swap mb
        this.listen(onSwitchClose(machine.sSingleStandup), () => {
            if (this.mbsReady.size < 2) return;
            const mbs = [...this.mbsReady.keys()];
            const cur = mbs.indexOf(this.selectedMb!);
            if (cur >= mbs.length - 1)
                this.selectedMb = mbs[0];
            else
                this.selectedMb = mbs[cur+1];
        });

        // add chips
        this.listen(
            onAnySwitchClose(machine.sRampMini, machine.sRampMiniOuter, machine.sSpinnerMini, machine.sSidePopMini, machine.sUpperPopMini),
            'addChip');
        this.listen(
            onAnySwitchClose(...machine.sUpperLanes),
            (e) => {
                const i = machine.sUpperLanes.indexOf(e.sw);
                if (!this.laneChips[i]) return;
                this.addChip();
                // this.addChip();             
                this.laneChips[i] = false;
                if (this.laneChips.every(c => !c)) {
                    this.laneChips.fill(true);
                    this.ball!.bonusX++;
                    alert(`bonus ${this.ball!.bonusX}X`);
                }
            });
        // award chips on bank complete
        this.listen<DropBankCompleteEvent>(e => e instanceof DropBankCompleteEvent, (e) => {
            this.miniReady = true;
            for (let i=0; i<e.bank.targets.length; i++)
                this.addChip();
        });
        // subtract chips
        this.listen([...onSwitchClose(machine.sPopperButton), () => !machine.sShooterLane.state && machine.out!.treeValues.kickerEnable], async () => {
            if (this.chips === 0) return;
            await machine.cPopper.board.fireSolenoid(machine.cPopper.num);
            if (time() - (machine.cPopper.lastFired??time()) > 100) return;
            this.chips-=2;
            if (this.chips<0) this.chips = 0;
        });
        
        this.listen([...onSwitchClose(machine.sMagnetButton), () => !machine.sShooterLane.state], async () => {
            if (this.chips === 0) return;
            this.chips--;
        });

        this.listen(onChange(this, 'focus'), e => {
            if (e.oldValue) {
                e.oldValue.end();
            }
            if (e.value) {
                e.value.started();
                this.listen(e.value.onEnding, () => {
                    if (this.focus === e.value)
                        this.focus = undefined;
                    return 'remove';
                });
            } else {
                this.focus = new NoMode(this);
            }
        });

        
        // allow orbits to loop
        this.listen([onAnySwitchClose(machine.sShooterUpper, machine.sShooterMagnet)], () => this.closeShooter = true);
        this.listen([...onSwitchClose(machine.sLeftOrbit), () => machine.cRightGate.actual], () => this.closeShooter = true);
        this.listen(onAnyPfSwitchExcept(machine.sShooterUpper, machine.sShooterMagnet, machine.sShooterLower, machine.sLeftOrbit), () => this.closeShooter = false);

        this.listen(onSwitchClose(machine.sSidePopMini), () => {
            const bank = machine.dropBanks.reduce<DropBank|undefined>((prev, cur) => cur.numDown>(prev?.numDown??0)? cur:prev, undefined);
            if (bank) {
                return ResetBank(this, bank);
            }
            return;
        });

        this.listen(onSwitchClose(machine.sRampMiniOuter), () => {
            this.changeValue(20);
            const bank = machine.dropBanks.filter(b => b!==machine.leftBank).reduce<DropBank|undefined>((prev, cur) => cur.numDown>(prev?.numDown??0)? cur:prev, undefined);
            if (bank) {
                return ResetBank(this, bank);
            } else if (!machine.leftBank.allAreUp()) {
                return ResetBank(this, machine.leftBank);
            }
            return;
        });


        this.listen([...onSwitchClose(machine.sRampMade), () => machine.lRampStartMb.lit()], () => {
            switch (this.selectedMb) {
                case 'HandMb':
                    return HandMb.start(this);
                case 'FullHouseMb':
                    return FullHouseMb.start(this);
                case 'FlushMb':
                case 'StraightMb':
                    return StraightMb.start(this);
                default:
                    debugger;
                    return;
            }
        });

        this.listen([...onSwitchClose(machine.sShooterLane), () => machine.lShooterStartHand.lit()], async () => {
            await Poker.start(this);
        });

        this.watch((e) => {
            if (!this.selectedMb) {
                if (this.mbsReady.size)
                    this.selectedMb = this.rand.randSelect(...this.mbsReady.keys());
            } else {
                if (!this.mbsReady.has(this.selectedMb))
                    this.selectedMb = undefined;
            }
        });

        addToScreen(() => new PlayerGfx(this));
    }

    rng(): Rng {
        return new Rng(this.seed);
    }

    
    async startBall() {
        await Ball.start(this);
    }
    store: { [name: string]: any } = {
        Poker: {},
        StraightMb: {},
        Skillshot: {},
        HandMb: {},
        NoMode: {},
        FullHouseMb: {},
    };
    storeData<T extends Tree<any>>(tree: T, props: ((keyof Omit<T, keyof Tree<any>>)&string)[]) {
        assert(tree.name in this.store);

        const store = this.store[tree.name];
        for (const prop of props) {
            if (!(prop in store))
                store[prop] = tree[prop];
            
            Object.defineProperty(tree, prop, {
                get() {
                    return store[prop];
                },
                set(val) {
                    store[prop] = val;
                },
            });
        }

        State.declare<T>(store, props);
    }

    addChip() {
        if (this.chips < 4)
            this.chips++;
        else 
            this.store.Poker.bank += 50;
    }
    changeValue(value: number) {
        this.store.Poker!.cashValue += value;
        alert(`CASH VALUE ${value>0? '+':'-'} ${comma(Math.abs(value))}`, undefined, `NOW ${comma(this.store.Poker!.cashValue)}`);
    }
}

class NoMode extends Mode {
    rng!: Rng;
    targets = new Map<DropTarget, Color>();
    spinnerValue?: number;

    constructor(
        public player: Player,
    ) {
        super(Modes.NoMode);
        this.rng = player.rng();
        State.declare<NoMode>(this, ['targets', 'spinnerValue']);
        player.storeData<NoMode>(this, ['rng']);

        this.addTargets();

        const outs: any = {};
        for (const target of machine.dropTargets) {
            outs[target.image.name] = () => this.targets.has(target)? colorToArrow(this.targets.get(target)) : undefined;
        }
        this.out = new Outputs(this, {
            ...outs,
            spinnerValue: () => this.spinnerValue,
        });

        this.listen<DropDownEvent>([DropDownEvent.on(), e => this.targets.has(e.target)], (e) => {
            this.spinnerValue = undefined;
            switch (this.targets.get(e.target)) {
                case Color.Orange:
                    player.addChip();
                    break;
                case Color.Green:
                    player.changeValue(20);
                    break;
                case Color.Red:
                    player.changeValue(-20);
                    break;
                case Color.Blue:
                    this.spinnerValue = 2000;
                    break;
            }
            this.targets.delete(e.target);
            if (this.targets.size === 0)
                this.addTargets();
        });
    }

    addTargets() {
        for (const target of this.rng.randSelectRange(2, 4-this.player.chips+1, ...machine.dropTargets))
            this.targets.set(target, Color.Orange);
        for (const target of this.rng.randSelectMany(this.rng.weightedSelect([8, 1], [1, 2], [1, 0]), ...machine.dropTargets))
            this.targets.set(target, Color.Blue);
        for (const target of this.rng.randSelectMany(this.rng.weightedSelect([8, 1], [3, 2], [3, 0]), ...machine.dropTargets))
            this.targets.set(target, Color.Red);
        for (const target of this.rng.randSelectMany(this.rng.weightedSelect([14, 1], [3, 2], [3, 0]), ...machine.dropTargets))
            this.targets.set(target, Color.Green);
    }

    end() {
        return super.end();
    }
}

class Spinner extends Tree<MachineOutputs> {
    lastSpinAt?: Time;
    lastHitAt?: Time;
    ripCount = 0;
    score = 10;
    comboMult = 1;
    ripTotal = 0;

    rounds = 0;
    maxRounds = 1;

    display = pfx? makeText('10  ', 50, 'corner', undefined, pfx).rz(90).x(80).y(160).sy(-1) : undefined;

    tb?: Group;
    ripTimer?: TimerQueueEntry;


    constructor(
        public player: Player,
    ) {
        super();

        State.declare<Spinner>(this, ['rounds', 'score', 'comboMult']);

        this.out = new Outputs(this, {
            leftGate: () => this.rounds > 0,
            iSpinner: () => this.display,
        });

        this.listen(onSwitchClose(machine.sSpinner), 'hit');

        this.listen([
            () => !machine.out!.treeValues.spinnerValue,
            ...onSwitchClose(machine.sLeftInlane),
            () => (!!this.lastSpinAt && time()-this.lastSpinAt < 2000) || machine.lastSwitchHit === machine.sSpinner],
        () => {
            if (this.rounds > 0)
                this.rounds--;
            this.comboMult+=2;
        });

        this.listen([onAnySwitchClose(...machine.sUpperLanes), () => this.rounds === 0, () => !machine.out!.treeValues.spinnerValue], () => {
            this.rounds = this.maxRounds;
            this.maxRounds++;
            if (this.maxRounds > 3)
                this.maxRounds = 3;
        });

        this.listen(onAnySwitchClose(...machine.sUpperLanes, machine.sLeftSling, machine.sRightSling), () => this.comboMult = 1);

        this.watch(() => this.updateDisplay());

        this.listen(e => e instanceof DropDownEvent, () => this.calcScore());
        this.listen(e => e instanceof DropBankResetEvent, () => this.calcScore());

        if (gfx) {
            this.tb = textBox({padding: 15}, 
                ['1000', 70, 20],
                ['6 SPINS', 40],
            ).z(90);
        }
    }

    hit() {
        void playSound('deal');
        if (!this.lastSpinAt || time()-this.lastSpinAt > 750) {
            Events.fire(new SpinnerHit());
            this.lastHitAt = time();
            this.ripCount = 0;
            this.ripTotal = 0;
        }
        this.lastSpinAt = time();
        const value = (machine.out!.treeValues.spinnerValue ?? this.score) * this.comboMult;
        this.player.score += value;
        this.ripCount++;
        this.ripTotal += value;
        if (this.ripCount > 3) {
            Events.fire(new SpinnerRip());
            if (this.tb) {
                if (!this.ripTimer) {
                    this.ripTimer = Timer.callIn(() => {
                        this.player.gfx?.remove(this.tb!);
                        this.ripTimer = undefined;
                    }, 750);
                    this.player.gfx?.add(this.tb);
                }
                (this.tb.children[1] as Text).text(score(this.ripTotal));
                (this.tb.children[2] as Text).text(`${this.ripCount} SPINS`);
                this.ripTimer.time = time() + 750 as Time;
            }
        }
    }

    updateDisplay() {
        this.display?.text(`${machine.out!.treeValues.spinnerValue ?? this.score}${this.comboMult>1? `*${this.comboMult}` : '  '}`);
    }

    calcScore() {
        const down = [4, 3, 2, 1].map(num => ([num, machine.dropBanks.filter(bank => bank.targets.filter(t => t.state).length === num).length]));
        const countValue = [0, 100, 400, 1000, 3000, 6000, 20000];
        const best = down.find(([n, c]) => c > 0);
        if (best)
            this.score = best[0] * countValue[best[1]];
        else
            this.score = 10;
    }
}
export class SpinnerHit extends Event {
    
}
export class SpinnerRip extends Event {
    
}

class LeftOrbit extends Tree<MachineOutputs> {
    score = 20000;
    comboMult = 1;

    rounds = 1;
    maxRounds = 1;

    constructor(
        public player: Player,
    ) {
        super();

        State.declare<LeftOrbit>(this, ['rounds', 'score', 'comboMult']);

        this.out = new Outputs(this, {
            rightGate: () => this.rounds > 0,
        });

        this.listen(onSwitchClose(machine.sLeftOrbit), 'hit');

        this.listen([
            onAnySwitchClose(machine.sShooterMagnet, machine.sShooterUpper),
            () => (machine.sLeftOrbit.wasClosedWithin(2000) && machine.lastSwitchHit!==machine.sShooterUpper) || machine.lastSwitchHit === machine.sLeftOrbit],
        () => {
            if (this.rounds > 0)
                this.rounds--;
            this.comboMult+=3;
        });

        this.listen([onAnySwitchClose(...machine.sUpperLanes), () => this.rounds === 0], () => {
            this.rounds = this.maxRounds;
            this.maxRounds++;
            this.score += 10000;
            if (this.maxRounds > 3)
                this.maxRounds = 3;
        });

        this.listen(onAnySwitchClose(...machine.sUpperLanes, machine.sLeftSling, machine.sRightSling), () => this.comboMult = 1);
    }

    hit() {
        this.player.score += this.score * this.comboMult;
        notify(score(this.score)+(this.comboMult>1? '*'+this.comboMult : ''));
    }
}

export class RampCombo extends Tree<MachineOutputs> {
    constructor(
        public player: Player,
    ) {
        super();

        this.out = new Outputs(this, {
            rampUp: false,
            lRampArrow: [[Color.Yellow, 'fl']],
        });

        this.listen(onAnySwitchClose(machine.sLeftSling, machine.sRightSling), 'end');
        this.listen(e => e instanceof DropDownEvent, 'end');

        this.listen(onSwitchClose(machine.sRampMade), () => {
            player.score += 35000;
            notify(score(35000));
            return this.end();
        });
    }

    end() {
        this.player.rampCombo = undefined;
        return super.end();
    }
}

class PlayerOverrides extends Mode {
    constructor(public player: Player) {
        super(Modes.PlayerOverrides);
        this.out = new Outputs(this, {
            shooterDiverter: () => player.closeShooter||player.ball?.tilted? false : undefined,
            leftGate: () => machine.lastSwitchHit === machine.sLeftOrbit? false : undefined,
            rightGate: () => machine.lastSwitchHit === machine.sSpinner? false : undefined,
            kickerEnable: () => player.ball?.tilted? false : undefined,
            miniFlipperEnable: () => player.ball?.tilted? false : undefined,
            rampUp: () => player.ball?.tilted? true : undefined,
        });
    }
}