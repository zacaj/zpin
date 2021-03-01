import { MachineOutputs, machine, Machine } from '../machine';
import { Mode, Modes } from '../mode';
import { Poker, Card } from './poker';
import { State, onChange } from '../state';
import { Game } from '../game';
import { Outputs } from '../outputs';
import { add, Color, colorToArrow, flash, light, many, mix } from '../light';
import { onSwitchClose, onAnySwitchClose, onAnyPfSwitchExcept, onSwitch } from '../switch-matrix';
import { DropBankCompleteEvent, DropDownEvent, DropBankResetEvent, DropBank, DropTarget } from '../drop-bank';
import { Ball, BallEnd, BallEnding } from './ball';
import { Tree } from '../tree';
import { Event, Events, Priorities } from '../events';
import { Time, time, Timer, TimerQueueEntry, wait } from '../timer';
import { makeText, gfx, screen, addToScreen, alert, notify, pfx, textBox, Screen } from '../gfx';
import { StraightMb } from './straight.mb';
import { Multiball } from './multiball';
import { fork } from '../promises';
import { PlayerGfx } from '../gfx/player';
import { ClearHoles, KnockTarget, MiscAwards, ResetBank, ResetMechs } from '../util-modes';
import { assert, comma, getCallerLine, getCallerLoc, money, score, seq, short } from '../util';
import { Rng } from '../rand';
import { MPU } from '../mpu';
import { GameMode } from './game-mode';
import { Restart } from './restart';
import { HandMb } from './hand.mb';
import { Group, Text } from 'aminogfx-gl';
import { FullHouseMb } from './full-house.mb';
import { playSound } from '../sound';
import { Log } from '../log';
import { BonusEnd } from './bonus';
import { dFitText, dHash, dImage, dText } from '../disp';
const argv = require('yargs').argv;

export class Player extends Mode {
    chips = 1;
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

    upperLaneChips = [true, true, true, true];
    lowerLanes = [true, true, true, true];
    chipsLit = [true, false, true, false, true];
    
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
    mult?: Multiplier;

    get nodes() {
        return [
            this.clearHoles,
            this.ball,
            this.rampCombo,
            this.spinner,
            this.leftOrbit,
            this.focus,
            this.mult,
            ...this.tempNodes,
            this.overrides,
        ].truthy();
    }

    modesQualified = new Set<(number)>();
    mbsQualified = new Map<'StraightMb'|'FlushMb'|'HandMb'|'FullHouseMb', Card[]>([
        ['HandMb', []],
        ['StraightMb', []],
        ['FullHouseMb', []],
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

    mbColor(mb?: string): Color {
        if (!mb) mb = this.selectedMb;
        if (mb === 'HandMb')
            return Color.Green;
        if (mb === 'FullHouseMb')
            return Color.Yellow;
        else return Color.Blue;
    }

    get mbReady(): boolean {
        return (!this.curMode || !!this.poker) && this.mbsReady.size>0 && (this.poker?.step??7) >= 7;
    }

    get shooterStartHand(): boolean {
        return (!this.curMode && !this.store.Poker?.wasQuit) || (this.poker?.step??-1) >= 7;
    }

    get nextMb() {
        const mbs = [...this.mbsReady.keys()];
        const cur = mbs.indexOf(this.selectedMb!);
        if (cur >= mbs.length - 1)
            return mbs[0];
        else
           return mbs[cur+1];
    }

    get pokerEndingOrDone() {
        return (!this.curMode && !this.store.Poker?.wasQuit) || (this.poker?.step??-1) >= 7;
    }

    constructor(
        public game: Game,
        public number: number,
        public seed: string,
    ) {
        super(Modes.Player);
        this.rand = this.rng();
        State.declare<Player>(this, ['miniReady', '_score', 'ball', 'chips', 'modesQualified', 'selectedMb', 'mbsQualified', 'focus', 'closeShooter', 'upperLaneChips', 'lowerLanes', 'chipsLit']);
        State.declare<Player['store']>(this.store, ['Poker', 'StraightMb', 'Skillshot']);
        this.out = new Outputs(this, {
            leftMagnet: () => machine.sMagnetButton.state && time() - machine.sMagnetButton.lastChange < 4000 && !machine.sShooterLane.state && machine.out!.treeValues.kickerEnable,
            rampUp: () => !this.mbReady,
            iSS1: () => this.pokerEndingOrDone? dImage("start_hand_shooter") : undefined,
            // lEjectStartMode: () => (!this.curMode || this.poker) && this.modesReady.size>0? ((this.poker?.step??7) >= 7? [Color.Green] : [Color.Red]) : [],
            iSS4: () => dImage(`lanes_`+[machine.cLeftGate.actual, machine.cRightGate.actual].map(b => b? "go" : 'stop').join('_')),
            iSS6: dImage("add_cash_value_target"),
            lRampArrow: add(() => this.mbReady, () => [this.mbColor(), 'fl']),
            iRamp: () => (!this.curMode || this.poker) && this.mbsReady.size>0 && (this.poker?.step??7) >= 7? dImage(this.selectedMb?.slice(0, this.selectedMb!.length-2).toLowerCase()+'_mb') : undefined,
            lPower1: () => light(this.chips>=1, Color.Orange),
            lPower2: () => light(this.chips>=2, Color.Orange),
            lPower3: () => light(this.chips>=3, Color.Orange),
            lPopperStatus: () => light(this.chips>=1, Color.Green, Color.Red),
            shooterDiverter: () =>  (!this.curMode && !this.store.Poker?.wasQuit) || (this.poker?.step??-1) >= 7? true : undefined,
            lLaneUpper1: () => light(this.upperLaneChips[0], Color.Orange),
            lLaneUpper2: () => light(this.upperLaneChips[1], Color.Orange),
            lLaneUpper3: () => light(this.upperLaneChips[2], Color.Orange),
            lLaneUpper4: () => light(this.upperLaneChips[3], Color.Orange),
            lLaneLower1: () => light(this.lowerLanes[0], Color.Yellow),
            lLaneLower2: () => light(this.lowerLanes[1], Color.Yellow),
            lLaneLower3: () => light(this.lowerLanes[2], Color.Yellow),
            lLaneLower4: () => light(this.lowerLanes[3], Color.Yellow),
            lMiniReady: () => this.miniReady? [Color.Green] : [Color.Red],
            lRampMini: add(() => this.chipsLit[0], Color.Orange),
            lUpperLaneTarget: add(() => this.chipsLit[2], Color.Orange),
            lUpperTargetArrow: add(() => this.chipsLit[3], Color.Orange),
            lSpinnerTarget: add(() => this.chipsLit[4], Color.Orange),
            lMainTargetArrow: many(() => ({
                [this.mbColor(this.nextMb)]: this.mbsReady.size>1 && !!this.noMode,
                [Color.Orange]: this.chipsLit[1],
            })),

        });
        

        // natural inlane -> lower ramp
        // this.listen(
        //     [...onSwitchClose(machine.sRightInlane), () => !machine.sShooterLower.wasClosedWithin(2000) && !machine.sShooterMagnet.wasClosedWithin(2000) && !machine.sRightInlane.wasClosedWithin(2000)],
        //     e => {
        //         if (!this.rampCombo) {
        //             this.rampCombo = new RampCombo(this);
        //             this.rampCombo.started();
        //         }
        //     });

        // lane change
        this.listen(onAnySwitchClose(machine.sLeftFlipper),
            e => {
                this.upperLaneChips.rotate(-1);
                this.lowerLanes.rotate(-1);
            });
        this.listen(onAnySwitchClose(machine.sRightFlipper),
            e => {
                this.upperLaneChips.rotate(1);
                this.lowerLanes.rotate(1);
            });


        // swap mb
        this.listen(onSwitchClose(machine.sSingleStandup), () => {
            if (this.mbsReady.size < 2) return;
            this.selectedMb = this.nextMb;
        });

        const chipSwitches = [
            machine.sRampMini,
            machine.sSingleStandup,
            machine.sUpperPopMini,
            machine.sSidePopMini,
            machine.sSpinnerMini,
        ];
        // add chips
        this.listen(
            onAnySwitchClose(...chipSwitches),
            (e) => {
                const i = chipSwitches.indexOf(e.sw);
                if (this.chipsLit[i]) {
                    this.addChip();
                    this.chipsLit.rotate(1);
                }
            });
        this.listen(
            onAnySwitchClose(...machine.sUpperLanes),
            (e) => {
                const i = machine.sUpperLanes.indexOf(e.sw);
                if (!this.upperLaneChips[i]) return;
                this.addChip();
                // this.addChip();             
                this.upperLaneChips[i] = false;
                if (this.upperLaneChips.every(c => !c)) {
                    this.upperLaneChips.fill(true);
                    this.ball!.bonusX++;
                    alert(`bonus ${this.ball!.bonusX}X`);
                }
            });
        
        // lower lanes
        this.listen(
            onAnySwitchClose(...machine.sLowerlanes),
            (e) => {
                const i = machine.sLowerlanes.indexOf(e.sw);
                if (!this.lowerLanes[i] || this.mult) return;
                this.lowerLanes[i] = false;
                if (this.lowerLanes.every(c => !c)) {
                    this.lowerLanes.fill(true);
                    this.mult = new Multiplier(this);
                    this.mult.started();
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
            if (!machine.lPower1.lit()) return;
            await machine.cPopper.board.fireSolenoid(machine.cPopper.num);
            if (time() - (machine.cPopper.lastFired??time()) > 100) return;
            
            if (!machine.lPower1.is(Color.Orange))
                this.chips-=1;
            if (this.chips<0) this.chips = 0;
        });
        
        this.listen([...onSwitchClose(machine.sMagnetButton), () => !machine.sShooterLane.state], async () => {
            if (!machine.lPower1.lit()) return;
            if (!machine.lPower1.is(Color.Orange))
                this.chips-=1;
                if (this.chips<0) this.chips = 0;
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

        this.listen(onSwitchClose(machine.sLeftInlane), () => fork(KnockTarget(this)));
        
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
            this.changeValue(25);
            const bank = machine.dropBanks.filter(b => b!==machine.leftBank).reduce<DropBank|undefined>((prev, cur) => cur.numDown>(prev?.numDown??0)? cur:prev, undefined);
            if (bank) {
                return ResetBank(this, bank);
            } else if (!machine.leftBank.allAreUp()) {
                return ResetBank(this, machine.leftBank);
            }
            return;
        });


        this.listen([...onSwitchClose(machine.sRampMade), () => this.mbReady], () => {
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

        this.listen([...onSwitchClose(machine.sShooterLane), () => this.shooterStartHand], async () => {
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
        MiscAwards: {},
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
        if (this.chips < 3)
            this.chips++;
        else 
            this.store.Poker.bank += 50;
    }
    changeValue(value: number, showAlert = true) {
        this.store.Poker!.cashValue += value;
        Log.log('game', 'change cash value by %i to %i', value, this.store.Poker!.cashValue);
        if (showAlert)
            alert(`CASH VALUE ${value>0? '+':'-'} ${comma(Math.abs(value))}`, undefined, `NOW ${comma(this.store.Poker!.cashValue)}`);
    }
}

class NoMode extends MiscAwards {
    constructor(
        player: Player,
    ) {
        super(player);

        this.randomizeTargets();
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

    displayText = '10';

    tb?: Group;
    ripTimer?: TimerQueueEntry;


    constructor(
        public player: Player,
    ) {
        super();

        State.declare<Spinner>(this, ['rounds', 'score', 'comboMult', 'displayText']);

        this.out = new Outputs(this, {
            leftGate: () => this.rounds > 0,
            iSpinner: () => dHash({
                ...dImage("per_spin"),
                ...dFitText(this.displayText, 57, 'baseline'),
            }),
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
        const value = machine.out!.treeValues.spinnerValue ?? this.score;
        if (this.comboMult>1)
            this.displayText = `${short(value)} *${this.comboMult}`;
        else
            this.displayText = score(value);
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


export class Multiplier extends Tree<MachineOutputs> {
    total = 0;
    text!: Group;

    constructor(
        public player: Player,
    ) {
        super();
        State.declare<Multiplier>(this, ['total']);

        this.out = new Outputs(this, {
            lLaneLower1: () => [[Color.Red, 'pl']],
            lLaneLower2: () => [[Color.Red, 'pl']],
            lLaneLower3: () => [[Color.Red, 'pl']],
            lLaneLower4: () => [[Color.Red, 'pl']],
        });

        this.listen(
            onAnySwitchClose(...machine.sLowerlanes),
            async (e) => {
                await wait(250);
                return this.end();
            });
        this.listen(onAnySwitchClose(machine.sLeftSling, machine.sRightSling), 'end');

        this.listen(onChange(player, '_score'), e => this.total += e.value - e.oldValue);

        this.text = textBox({maxWidth: 0.8}, 
            ['2X SCORING', 60, 20],
            ['Avoid Lanes and Slings', 35, 20],
            ['', 50, 10],
        );
        if (screen) {
            player.gfx?.add(this.text);
            this.text.z(100);
            this.text.y(0);
            this.watch(() => (this.text.children[3] as Text).text(score(this.total)));
        }

        this.listen(e => e instanceof BonusEnd, 'end');
    }

    end() {
        this.player.gfx?.remove(this.text);
        this.player.mult = undefined;
        const ret = super.end();
        this.player.score += this.total;
        notify(`2X Total: ${score(this.total)}`);
        return ret;
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