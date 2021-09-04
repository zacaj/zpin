import { MachineOutputs, machine, Machine } from '../machine';
import { Mode, Modes } from '../mode';
import { Poker, Card } from './poker';
import { State, onChange } from '../state';
import { Game } from '../game';
import { Outputs } from '../outputs';
import { add, Color, colorToArrow, flash, light, many, mix } from '../light';
import { onSwitchClose, onAnySwitchClose, onAnyPfSwitchExcept, onSwitch, SwitchEvent } from '../switch-matrix';
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
import { ClearHoles, Effect, KnockTarget, MiscAwards, ResetBank, ResetMechs } from '../util-modes';
import { assert, comma, getCallerLine, getCallerLoc, money, round, score, seq, short } from '../util';
import { Rng } from '../rand';
import { MPU } from '../mpu';
import { GameMode } from './game-mode';
import { Restart } from './restart';
import { HandMb } from './hand.mb';
import { Group, Text } from 'aminogfx-gl';
import { FullHouseMb } from './full-house.mb';
import { playSound, playVoice } from '../sound';
import { Log } from '../log';
import { BonusEnd } from './bonus';
import { dFitText, dHash, dImage, dMany, dText } from '../disp';
import { HighscoreEntry } from './highscore.mode';
import { getHighscores } from '../highscore';
import { FlushMb } from './flush.mb';
import { getMysteryAwards, Mystery, MysteryAward, MysteryNext } from './mystery.mode';
const argv = require('yargs').argv;

export enum Difficulty {
    Casual = 0,
    Normal = 1,
    Expert = 2,
    Zac = 3,
}

export class Player extends Mode {
    store = {
        Poker: {} as any,
        StraightMb: {} as any,
        Skillshot: {} as any,
        HandMb: {} as any,
        NoMode: {} as any,
        MiscAwards: {} as any,
        FullHouseMb: {} as any,
        FlushMb: {} as any,
        Bonus: {} as any,
        Multiplier: {} as any,
        Spinner: {} as any,
    };
    storeData<T extends Tree<any>>(tree: T, props: ((keyof Omit<T, keyof Tree<any>>)&string)[]) {
        assert(tree.name in this.store);

        const store = (this.store as any)[tree.name as any];
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

    chips = 3;
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
    addScore(amount: number, source: string|null, announce = false) {
        if (this.ball?.tilted) return;
        this._score += amount;
        if (source && amount)
            this.recordScore(amount, source);
        if (announce)
            alert(score(amount)+'!');
    }
    recordScore(amount: number, source: string) {
        if (!this.game.totals[source])
            this.game.totals[source] = {times: 0, total: 0, average: 0};
        this.game.totals[source].times++;
        this.game.totals[source].total += amount;
        this.game.totals[source].average = this.game.totals[source].total / this.game.totals[source].times;
    }
    miniReady = true;

    difficulty = Difficulty.Normal;
    setDifficulty(difficulty: Difficulty) {
        this.difficulty = difficulty;
        if (difficulty<=Difficulty.Normal)
            this.upperLaneChips = [true, true, true, true];
        else
            this.upperLaneChips = [true, false, false, false];

        if (difficulty<=Difficulty.Normal)
            this.chipsLit = [true, false, true, false, true];
        else if (difficulty<=Difficulty.Expert)
            this.chipsLit = [true, false, true, false, false];
        else
            this.chipsLit = [true, false, false, false, false];

        this.chips = this.startingChips;
        
        if (difficulty<=Difficulty.Normal)
            this.store.Poker.handsForMb = 1;
        else
            this.store.Poker.handsForMb = 2;

        this.miniReady = difficulty <= Difficulty.Normal;
    }
    get startingChips() {
        if (this.difficulty<=Difficulty.Normal)
            return 3;
        else if (this.difficulty===Difficulty.Zac)
            return 1;
        else
            return 2;
    }

    upperLaneChips = [true, false, false, false];
    upperLanes = [true, true, true, true];
    lowerLanes = [true, true, true, true];
    chipsLit = [true, false, false, false, false];

    outlanes = 0;
    
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
    backupPoker?: Poker;

    clearHoles = new ClearHoles();
    spinner = new Spinner(this);
    overrides = new PlayerOverrides(this);
    ball?: Ball;
    mult?: Multiplier;
    mystery?: Mystery;

    get nodes() {
        return [
            this.clearHoles,
            this.ball,
            this.spinner,
            this.focus,
            this.mult,
            this.mystery,
            ...this.tempNodes,
            this.overrides,
        ].truthy();
    }

    modesQualified = new Set<(number)>();
    mbsQualified = new Map<'StraightMb'|'FlushMb'|'HandMb'|'FullHouseMb', Card[]>([
        // ['HandMb', []],
        // ['StraightMb', []],
        // ['FullHouseMb', []],
        // ['FlushMb', []],
    ]);

    selectedMb?: 'StraightMb'|'FlushMb'|'HandMb'|'FullHouseMb';

    get modesReady() {
        return new Set([...this.modesQualified, ...(this.poker?.newModes ?? [])]);
    }
    get mbsReady() {
        return new Map([...this.mbsQualified, ...((this.poker?.step??0)>=7? this.poker?.newMbs ?? [] : [])]);
    }
    rand!: Rng;
    mysteryRng!: Rng;
    mysteryLeft = 3;
    mysteryNext = MysteryNext.Target;
    mysteryAwards!: MysteryAward[];

    closeShooter = false;

    straightMbStatus = 0;
    fullHouseMbStatus = 100000;
    flushMbStatus = 1000000;
    get royalFlushReady() {
        return this.straightMbStatus>0 && this.fullHouseMbStatus>0 && this.flushMbStatus>0;
    }

    mbColor(mb?: string): Color {
        if (!mb) mb = this.selectedMb;
        if (mb === 'HandMb')
            return Color.Green;
        if (mb === 'FullHouseMb')
            return Color.Yellow;
        if (mb === 'FlushMb')
            return Color.Pink;
        else return Color.Blue;
    }

    get mbReady(): boolean {
        return (!this.curMode || !!this.poker) && this.mbsReady.size>0 && (machine.ballsInPlay==='unknown'||machine.ballsInPlay<=1);
    }

    get handMbQualified(): boolean {
        return this.mbsReady.has('HandMb');
    }

    get canStartHand(): boolean {
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


    constructor(
        public game: Game,
        public number: number,
        public seed: string,
    ) {
        super(Modes.Player);
        this.rand = this.rng();
        this.mysteryRng = this.rng();
        this.mysteryAwards = getMysteryAwards(this);
        State.declare<Player>(this, ['miniReady', '_score', 'ball', 'difficulty', 'chips', 'modesQualified', 'selectedMb', 
            'mbsQualified', 'focus', 'closeShooter', 'upperLanes', 'upperLaneChips', 'lowerLanes', 'mysteryLeft', 'chipsLit',
            'straightMbStatus', 'flushMbStatus', 'fullHouseMbStatus',
        ]);
        State.declare<Player['store']>(this.store, ['Poker', 'StraightMb', 'Skillshot']);
        this.out = new Outputs(this, {
            leftMagnet: () => machine.sMagnetButton.state && time() - machine.sMagnetButton.lastChange < 4000 && !machine.sShooterLane.state && machine.out!.treeValues.kickerEnable,
            rampUp: () => !this.mbReady,
            iSS1: () => this.canStartHand? dImage("start_hand_shooter") : undefined,
            // lEjectStartMode: () => (!this.curMode || this.poker) && this.modesReady.size>0? ((this.poker?.step??7) >= 7? [Color.Green] : [Color.Red]) : [],
            iSS4: () => dImage(`lanes_`+[machine.cLeftGate.actual, machine.cRightGate.actual].map(b => b? "go" : 'stop').join('_')),
            iSS5: () => this.mysteryLeft>0? dMany(dImage(`mystery_next_${this.mysteryNext}`), dText(this.mysteryLeft.toFixed(0), 3, -10, 'top', 100)) : !this.curMbMode? dImage('mystery_lit') : undefined,
            iSS6: dImage("add_cash_value_target"),
            lRampArrow: add(() => this.mbReady && !machine.cRamp.actual, () => [this.mbColor(), 'fl']),
            iRamp: () => this.mbReady? dImage(this.selectedMb?.slice(0, this.selectedMb!.length-2).toLowerCase()+'_mb') : undefined,
            lEjectArrow: add(() => this.mysteryLeft===0 && !this.curMbMode && !this.mystery, [Color.Purple, 'pl']),
            lPower1: () => light(this.chips>=1, Color.Orange),
            lPower2: () => light(this.chips>=2, Color.Orange),
            lPower3: () => light(this.chips>=3, Color.Orange),
            lPopperStatus: () => light(this.chips>=1, Color.Green, Color.Red),
            shooterDiverter: () =>  (!this.curMode && !this.store.Poker?.wasQuit) || (this.poker?.step??-1) >= 7? true : undefined,
            lLaneUpper1: () => this.upperLanes[0]? [!this.curMbMode && this.upperLaneChips[0] && this.chips<3? Color.Orange : Color.Green] : [],
            lLaneUpper2: () => this.upperLanes[1]? [!this.curMbMode && this.upperLaneChips[1] && this.chips<3? Color.Orange : Color.Green] : [],
            lLaneUpper3: () => this.upperLanes[2]? [!this.curMbMode && this.upperLaneChips[2] && this.chips<3? Color.Orange : Color.Green] : [],
            lLaneUpper4: () => this.upperLanes[3]? [!this.curMbMode && this.upperLaneChips[3] && this.chips<3? Color.Orange : Color.Green] : [],
            lLaneLower1: () => light(this.lowerLanes[0], Color.Blue),
            lLaneLower2: () => light(this.lowerLanes[1], Color.Blue),
            lLaneLower3: () => light(this.lowerLanes[2], Color.Blue),
            lLaneLower4: () => light(this.lowerLanes[3], Color.Blue),
            lMiniReady: () => this.miniReady? [Color.Green] : [Color.Red],
            lRampMini: add(() => !this.curMbMode && this.chipsLit[0] && this.chips<3, Color.Orange),
            lUpperLaneTarget: add(() => !this.curMbMode && this.chipsLit[2] && this.chips<3, Color.Orange),
            lUpperTargetArrow: add(() => !this.curMbMode && this.chipsLit[3] && this.chips<3, Color.Orange),
            lSpinnerTarget: add(() => !this.curMbMode && this.chipsLit[4] && this.chips<3, Color.Orange),
            lMainTargetArrow: many(() => ({
                [this.mbColor(this.nextMb)]: this.mbsReady.size>1 && !this.curMbMode,
                [Color.Orange]: this.chipsLit[1],
            })),
            popper: () => !machine.sShooterLane.state && machine.out!.treeValues.kickerEnable && machine.lPower1.lit(),
            lStraightStatus: () => (this.straightMbStatus??0)>150000? [[Color.Green, this.royalFlushReady&&'pl']] : (this.straightMbStatus??0)>0? [[Color.Red, this.royalFlushReady&&'pl']] : [],
            lFullHouseStatus: () => (this.flushMbStatus??0)>150000? [[Color.Green, this.royalFlushReady&&'pl']] : (this.flushMbStatus??0)>0? [[Color.Red, this.royalFlushReady&&'pl']] : [],
            lFlushStatus: () => (this.flushMbStatus??0)>150000? [[Color.Green, this.royalFlushReady&&'pl']] : (this.flushMbStatus??0)>0? [[Color.Red, this.royalFlushReady&&'pl']] : [],
        });

        // mystery
        this.listen<SwitchEvent>(e => e instanceof SwitchEvent && e.sw.state, e => {
            if (!this.mysteryLeft) return;
            switch (this.mysteryNext) {
                case MysteryNext.Lane:
                    if (!machine.sLanes.includes(e.sw)) return;
                    break;
                case MysteryNext.Shot:
                    if (!machine.shots.some(s => s.sw === e.sw)) return;
                    break;
                case MysteryNext.Sling:
                    if (machine.sLeftSling!==e.sw && machine.sRightSling!==e.sw) return;
                    break;
                case MysteryNext.Standup:
                    if (!machine.sStandups.includes(e.sw)) return;
                    break;
                case MysteryNext.Target:
                    if (!machine.dropTargets.some(t => t.switch === e.sw)) return;
                    break;
            }

            this.mysteryNext = this.mysteryRng.randSelect(...Object.values(MysteryNext));
            this.mysteryLeft--;

            if (this.mysteryLeft === 0) {
                alert('MYSTERY LIT');
                void playVoice('mystery is lit');
            }
        });

        this.listen(onSwitchClose(machine.sUpperEject), async () => {
            const mode = await Mystery.start(this);
            if (mode) {
                this.mystery!.started();
            }
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
                this.upperLanes.rotate(-1);
                this.upperLaneChips.rotate(-1);
                this.lowerLanes.rotate(-1);
            });
        this.listen(onAnySwitchClose(machine.sRightFlipper),
            e => {
                this.upperLanes.rotate(1);
                this.upperLaneChips.rotate(1);
                this.lowerLanes.rotate(1);
            });


        // swap mb
        this.listen(onSwitchClose(machine.sSingleStandup), () => {
            if (this.mbsReady.size < 2) return;
            this.selectedMb = this.nextMb;
            void playSound('swap mb');
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
                else
                    void playSound('single chip fall wood deep');
            });
        this.listen(
            onAnySwitchClose(...machine.sUpperLanes),
            (e) => {
                const i = machine.sUpperLanes.indexOf(e.sw);
                if (!this.upperLanes[i]) {
                    void playSound('lane');
                    return;
                }

                if (this.upperLaneChips[i]) 
                    this.addChip();
                // this.addChip();             
                this.upperLanes[i] = false;
                if (this.upperLanes.every(c => !c)) {
                    this.upperLanes.fill(true);
                    this.ball!.bonusX++;
                    alert(`bonus ${this.ball!.bonusX}X`);
                    if (this.ball!.bonusX <= 4)
                        void playVoice(`bonus ${this.ball!.bonusX}x`);
                    else
                        void playVoice('bonus x');
                }
            });

        this.listen(onAnySwitchClose(machine.sLeftSling, machine.sRightSling), () => this.chipsLit.rotate(1));
        
        // lower lanes
        this.listen(
            onAnySwitchClose(...machine.sLowerlanes),
            (e) => {
                const i = machine.sLowerlanes.indexOf(e.sw);
                if (!this.lowerLanes[i] || this.mult) {
                    void playSound('bop');
                    return;
                }
                this.lowerLanes[i] = false;
                if (this.lowerLanes.every(c => !c)) {
                    this.lowerLanes.fill(true);
                    this.mult = new Multiplier(this);
                    this.mult.started();
                }
                else   
                    void playSound('lane');
            });

        //  bank complete
        this.listen<DropBankCompleteEvent>(e => e instanceof DropBankCompleteEvent, (e) => {
            this.miniReady = true;
        });

        // subtract chips
        this.listen([...onSwitchClose(machine.sPopperButton), () => !machine.sShooterLane.state && machine.out!.treeValues.kickerEnable], async () => {
            if (!machine.lPower1.lit()) {
                void playSound('wrong');
                return;
            }
            // await machine.cPopper.board.fireSolenoid(machine.cPopper.num);
            // if (time() - (machine.cPopper.lastFired??time()) > 100) return;
            
            if (machine.lPopperStatus.is(Color.Green))
                this.chips-=1;
            if (this.chips<0) this.chips = 0;
        });
        
        this.listen([...onSwitchClose(machine.sMagnetButton), () => machine.sShooterLane.state && this.game.ballNum===1 && this.score===0], () => {
            const diffs = Object.values(Difficulty).filter(x => !isNaN(x as any)) as Difficulty[];
            let i = diffs.indexOf(this.difficulty);
            i++;
            if (i>=diffs.length) i=0;
            this.setDifficulty(diffs[i]);
        });
        this.listen([...onSwitchClose(machine.sMagnetButton), () => !machine.sShooterLane.state], async () => {
            if (!machine.lPower1.lit()) {
                void playSound('wrong');
                return;
            }
            if (machine.lMagnet1.is(Color.Green))
                this.chips-=1;
            if (this.chips<0) this.chips = 0;

            // for (let i=0; i<50; i++) {
            //     await playSound('chip drop');
            //     await wait(Math.random()*30+15);
            // }

            // void playSound('card flop', 50, false, 100);
        });

        this.listen(onAnySwitchClose(machine.sLeftOutlane, machine.sRightOutlane), () => this.outlanes++);

        this.listen(onChange(this, 'focus'), e => {
            if (e.oldValue && e.oldValue !== this.backupPoker) {
                e.oldValue.end();
            }
            if (e.value) {
                e.value.started();
                this.listen(e.value.onEnding, () => {
                    if (this.focus === e.value)
                        this.focus = undefined;
                    return 'remove';
                });
            } else if (this.backupPoker && e.oldValue!==this.backupPoker) {
                this.focus = this.backupPoker;
                this.backupPoker = undefined;
            } else {
                this.focus = new NoMode(this);
            }
        });

        this.listen([...onSwitchClose(machine.sRightOutlane), () => machine.lPopperStatus.lit() && !machine.lPopperStatus.is(Color.Red)], () => 
            Effect(this.overrides, 800, {
                lPopperStatus: [[Color.Green, 'fl', 6]],
            }),
        );

        // this.listen(onSwitchClose(machine.sLeftInlane), () => fork(KnockTarget(this)));
        
        // allow orbits to loop
        this.listen([onAnySwitchClose(machine.sShooterUpper)], () => this.closeShooter = true);
        this.listen([onAnySwitchClose(machine.sShooterMagnet), () => machine.sSpinner.wasClosedWithin(1000)], () => this.closeShooter = true);
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
            if (this.poker && !this.poker.showCardsReady) {
                this.backupPoker = this.poker;
                this.focus = undefined;
            }
            switch (this.selectedMb) {
                case 'HandMb':
                    return HandMb.start(this);
                case 'FullHouseMb':
                    return FullHouseMb.start(this);
                case 'FlushMb':
                    return FlushMb.start(this);
                case 'StraightMb':
                    return StraightMb.start(this);
                default:
                    debugger;
                    return;
            }
        });

        this.listen([...onSwitchClose(machine.sShooterLane), () => this.canStartHand], async () => {
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

        // game.addTemp(new HighscoreEntry(game, this, ['HIGH SCORES', 'TOP EARNERS'], getHighscores()));
    }

    rng(): Rng {
        return new Rng(this.seed);
    }

    
    async startBall() {
        await Ball.start(this);
    }

    addChip() {
        if (this.chips < 3) {
            this.chips++;
            void playSound('single chip fall chip deep');
        }
        // else {
        //     this.store.Poker.bank += 50;
        //     void playSound('cash');
        // }
    }
    changeValue(value: number, showAlert = true) {
        if (value > 0)
            void playSound('ca ching');
        else 
            void playSound('ching ca');
        this.store.Poker!.cashValue += value;
        Log.log('game', 'change cash value by %i to %i', value, this.store.Poker!.cashValue);
        if (showAlert)
            alert(`CASH VALUE ${value>0? '+':'-'} ${comma(Math.abs(value))}`, undefined, `NOW ${comma(this.store.Poker!.cashValue)}`);
    }

    qualifyMb(mb: 'StraightMb'|'FlushMb'|'HandMb'|'FullHouseMb', hand: Card[] = [], ms?: number) {
        if (this.mbsQualified.has(mb)) return [undefined, Promise.resolve()];
        this.mbsQualified.set(mb, hand);
        switch (mb) {
            case 'FlushMb':
                void playVoice('flush mb is lit');
                return alert('flush multiball qualified', ms);
            case 'StraightMb':
                void playVoice('straight mb is lit');
                return alert('straight multiball qualified', ms);
            case 'FullHouseMb':
                void playVoice('fullhouse mb is lit');
                return alert('full house multiball qualified', ms);
            case 'HandMb':
                void playVoice('hand mb is lit');
                return alert('hand multiball qualified', ms);
        }
    }
}

class NoMode extends MiscAwards {
    leftOrbit!: LeftOrbit;
    get nodes() {
        return [
            this.leftOrbit,
            ...this.tempNodes,
        ].truthy();
    }

    constructor(
        player: Player,
    ) {
        super(player);

        this.leftOrbit = new LeftOrbit(player);

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

    maxRip = 0;

    constructor(
        public player: Player,
    ) {
        super();

        State.declare<Spinner>(this, ['rounds', 'score', 'comboMult', 'displayText']);
        player.storeData<Spinner>(this, ['maxRip']);

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
        void playSound('spinner');
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
            if (this.ripCount === 4)
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

            if (this.ripCount > this.maxRip)
                this.maxRip = this.ripCount;

            if (this.ripCount === 69)
                void playVoice('nice');
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
        const countValue = [0, 100, 1000, 2000, 6000, 8000, 20000];
        const best = down.find(([n, c]) => c > 0);
        if (best)
            this.score = best[0] * countValue[best[1]] * ((this.player.score/1000000+1)|0);
        else
            this.score = 10;
    }
}
export class SpinnerHit extends Event {
    
}
export class SpinnerRip extends Event {
    
}

enum LeftOrbitState {
    Ready = 0,
    RampDown = 1,
    Spinner1 = 2,
    Spinner2 = 3,
    SpinnerStop = 4,
    Lane = 5,
}
class LeftOrbit extends Tree<MachineOutputs> {
    // get score() {
    //     return 35000;
    //     // return Math.min(100000, round(this.player.score * (30/500), 10000, 30000));
    // }
    score = 25000;
    comboMult = 1;

    // rounds = 1;
    // maxRounds = 1;
    state = LeftOrbitState.Ready;

    get startReady() {
        return machine.cRamp.actual &&
            (
                machine.sRightInlane.wasClosedWithin(2500) || machine.lastSwitchHit === machine.sRightInlane
                || 
                (machine.sShooterLower.wasClosedWithin(4000) && !machine.cShooterDiverter.actual)
            );
    }

    constructor(
        public player: Player,
    ) {
        super();

        State.declare<LeftOrbit>(this, ['state', 'comboMult']);

        this.out = new Outputs(this, {
            rightGate: () => this.state <= LeftOrbitState.RampDown? true : undefined,
            leftGate: () => this.state>=LeftOrbitState.Spinner1 && this.state<=LeftOrbitState.Spinner2? true : undefined,
            iRamp: () => this.startReady || this.state > LeftOrbitState.Ready? dFitText(score(this.score*this.comboMult), 64, 'center') : undefined,
            lRampArrow: mix(() => this.state===LeftOrbitState.Ready && this.startReady? [Color.White, 'fl', 3] : this.state===LeftOrbitState.RampDown? [Color.White, 'fl', 7] : undefined),
            rampUp: () => this.state===LeftOrbitState.RampDown? false : undefined,
            lSpinnerArrow: mix(() => this.state>=LeftOrbitState.Spinner1 && this.state<=LeftOrbitState.Spinner2? [Color.White, 'fl', 7] : undefined),
            catcher: () => this.state === LeftOrbitState.SpinnerStop? true : undefined,
            lSideShotArrow: mix(() => this.state===LeftOrbitState.SpinnerStop? [Color.White, 'fl', 7] : undefined),
            lUpperLaneArrow: mix(() => this.state===LeftOrbitState.Lane? [Color.White, 'fl', 7] : undefined),
        });

        this.listen(onSwitchClose(machine.sLeftOrbit), 'hit');

        this.listen(e => e instanceof DropDownEvent, () => {
            this.state = LeftOrbitState.Ready;
            this.comboMult = 1;
        });
        this.listen(onAnySwitchClose(machine.sLeftSling, machine.sRightSling), () => () => {
            this.state = LeftOrbitState.Ready;
            this.comboMult = 1;
        });

        // this.listen([
        //     onAnySwitchClose(machine.sShooterMagnet, machine.sShooterUpper),
        //     () => (machine.sLeftOrbit.wasClosedWithin(2000) && machine.lastSwitchHit!==machine.sShooterUpper) || machine.lastSwitchHit === machine.sLeftOrbit],
        // () => {
        //     if (this.rounds > 0)
        //         this.rounds--;
        //     this.comboMult+=3;
        // });

        this.listen([...onSwitchClose(machine.sRampMade), () => !this.player.curMbMode], () => {
            if (this.state === LeftOrbitState.RampDown) {
                this.player.score += this.score * this.comboMult;
                this.score += 5000;
                this.comboMult += 1;
                this.state = LeftOrbitState.Spinner1;
                player.spinner.comboMult += 3;
                void playSound("ts wow 3");
                if (player.spinner.score < 2000)
                    player.spinner.score = 2000;
            }
        });

        this.listen(e => e instanceof SpinnerHit, () => {
            if (this.state === LeftOrbitState.Spinner1) {
                void playSound("ts wow 4");
                this.state = LeftOrbitState.Spinner2;
                this.addScore();
            }
            if (this.state === LeftOrbitState.Spinner2) {
                void playSound("ts wow 5");
                this.state = LeftOrbitState.SpinnerStop;
                this.addScore();
            }
        });

        this.listen(onAnySwitchClose(machine.sUpperInlane, machine.sUpperEject), () => {
            if (this.state === LeftOrbitState.SpinnerStop) {
                void playSound("ts wow 6");
                this.state = LeftOrbitState.Lane;
                this.addScore();
            }
        });

        this.listen(onAnySwitchClose(machine.sBackLane), () => {
            if (this.state === LeftOrbitState.Lane) {
                void playSound("ts wow 7");
                this.state = LeftOrbitState.Ready;
                this.addScore();
            }
        });

        // this.listen([onAnySwitchClose(...machine.sUpperLanes), () => this.rounds === 0], () => {
        //     this.rounds = this.maxRounds;
        //     this.maxRounds++;
        //     this.score += 10000;
        //     if (this.maxRounds > 3)
        //         this.maxRounds = 3;
        // });

        this.listen(onAnySwitchClose(...machine.sUpperLanes, machine.sLeftSling, machine.sRightSling), () => this.comboMult = 1);
    }

    hit() {
        this.player.score += this.score * this.comboMult;
        this.score += 5000;
        void playSound('orbit');
        notify(score(this.score)+(this.comboMult>1? '*'+this.comboMult : ''));
        if (this.startReady || this.state===LeftOrbitState.Spinner1) {
            this.state = LeftOrbitState.RampDown;
            this.score = Math.min(this.score, 50000);
            this.comboMult += 1;
        }
    }

    addScore() {
        this.player.score += this.score * this.comboMult;
        notify(score(this.score)+(this.comboMult>1? '*'+this.comboMult : ''));
        this.score += 5000;
        this.comboMult += 1;
    }
}


export class Multiplier extends Tree<MachineOutputs> {
    total = 0;
    text!: Group;

    lanes!: boolean[];

    topTotal = 0;

    constructor(
        public player: Player,
    ) {
        super();
        State.declare<Multiplier>(this, ['total', 'lanes']);
        player.storeData<Multiplier>(this, ['topTotal']);

        this.lanes = [true, true, false, false];

        this.out = new Outputs(this, {
            lLaneLower1: () => this.lanes[0]? [[Color.Red, 'pl', 2]] : [],
            lLaneLower2: () => this.lanes[1]? [[Color.Red, 'pl', 2]] : [],
            lLaneLower3: () => this.lanes[2]? [[Color.Red, 'pl', 2]] : [],
            lLaneLower4: () => this.lanes[3]? [[Color.Red, 'pl', 2]] : [],
        });

        this.listen(
            onAnySwitchClose(...machine.sLowerlanes),
            async (e) => {
                const i = machine.sLowerlanes.indexOf(e.sw);
                if (!this.lanes[i]) return;

                void playSound('error');
                // await wait(250);
                return this.end();
            });
        // this.listen(onAnySwitchClose(machine.sLeftSling, machine.sRightSling), () => {
        //     void playSound('error');
        //     return 'end';
        // });

        // lane change
        this.listen(onAnySwitchClose(machine.sLeftFlipper),
        e => {
            this.lanes.rotate(-1);
        });
        this.listen(onAnySwitchClose(machine.sRightFlipper),
        e => {
            this.lanes.rotate(1);
        });

        void playVoice('2x', 25);

        this.listen(onChange(player, '_score'), e => {
            const oldTotal = this.total;
            this.total += e.value - e.oldValue;
            if (this.total > 100000 && oldTotal <= 100000) 
                this.lanes[this.lanes.findIndex(x => !x)] = true;
        });

        this.text = textBox({maxWidth: 0.8}, 
            ['2X SCORING', 60, 20],
            ['Avoid Red Lanes', 35, 20],
            ['', 50, 10],
        );
        if (screen) {
            player.gfx?.add(this.text);
            this.text.z(70);
            this.text.y(0);
            this.text.x(-Screen.w/4);
            this.watch(() => (this.text.children[3] as Text).text(score(this.total)));
        }

        this.listen(e => e instanceof BonusEnd, 'end');
        this.listen([e => e instanceof BallEnding, () => ![machine.sLeftOutlane, machine.sRightOutlane, machine.sMiniOut].includes(machine.lastSwitchHit!)], 'end');
    }

    end() {
        this.player.mult = undefined;
        const ret = super.end();
        if (screen)
            // this.player.gfx?.remove(this.text);
            this.text.remove();
        this.player.score += this.total;
        if (this.topTotal < this.total)
            this.topTotal = this.total;
        notify(`2X Total: ${score(this.total)}`, this.total>100000? 5000 : 2500);
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