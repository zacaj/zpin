import { MachineOutputs, machine, Machine } from '../machine';
import { Mode, Modes } from '../mode';
import { Poker, Card } from './poker';
import { State, onChange } from '../state';
import { Game } from '../game';
import { Outputs } from '../outputs';
import { Color, light } from '../light';
import { onSwitchClose, onAnySwitchClose, onAnyPfSwitchExcept } from '../switch-matrix';
import { DropBankCompleteEvent, DropDownEvent, DropBankResetEvent } from '../drop-bank';
import { Ball } from './ball';
import { Tree } from '../tree';
import { Event, Events, Priorities } from '../events';
import { Time, time, wait } from '../timer';
import { makeText, gfx, screen, addToScreen, alert } from '../gfx';
import { StraightMb } from './straight.mb';
import { Multiball } from './multiball';
import { fork } from '../promises';
import { PlayerGfx } from '../gfx/player';
import { ClearHoles, ResetMechs } from '../util-modes';
import { assert } from '../util';
import { Rng } from '../rand';
import { MPU } from '../mpu';
import { GameMode } from './game-mode';
import { Restart } from './restart';

export class Player extends Mode {
    chips = 1;
    score = 0;

    laneChips = [true, true, true, true];
    
    get curMbMode(): Multiball|undefined {
        if (this.focus instanceof Multiball) return this.focus;
        return undefined;
    }
    get poker(): Poker|undefined {
        if (this.focus instanceof Poker) return this.focus;
        return undefined;
    }
    // private _noMode?: NoMode;
    get noMode(): NoMode|undefined {
        // return this._noMode;
        if (this.focus instanceof NoMode) return this.focus;
        return undefined;
    }
    get curMode() {
        return this.poker ?? this.curMbMode;
    }
    // get gameMode() {
    //     return this.curMbMode;
    // }
    // get focus() {
    //     return this.curMode ?? this.noMode!;
    // }
    focus?: Poker|Multiball|NoMode;

    clearHoles = new ClearHoles();
    spinner = new Spinner(this);
    leftOrbit = new LeftOrbit(this);
    overrides = new PlayerOverrides(this);
    ball?: Ball;

    get children() {
        return [
            this.clearHoles,
            this.ball,
            this.spinner,
            this.leftOrbit,
            this.focus,
            ...this.tempNodes,
            this.overrides,
        ].filter(x => !!x) as Tree<MachineOutputs>[];
    }


    rampUp = true;

    modesQualified = new Set<(number)>();
    mbsQualified = new Map<'StraightMb'|'FlushMb'|'HandsMb', Card[]>();

    get modesReady() {
        return new Set([...this.modesQualified, ...(this.poker?.newModes ?? [])]);
    }
    get mbsReady() {
        return new Set([...this.mbsQualified, ...(this.poker?.newMbs ?? [])]);
    }

    closeShooter = false;

    constructor(
        public game: Game,
        public number: number,
        public seed = 'pinball',
    ) {
        super(Modes.Player);
        State.declare<Player>(this, ['rampUp', 'score', 'chips', 'modesQualified', 'mbsQualified', 'focus', 'closeShooter', 'laneChips']);
        State.declare<Player['store']>(this.store, ['Poker', 'StraightMb', 'Skillshot']);
        this.out = new Outputs(this, {
            leftMagnet: () => machine.sMagnetButton.state && time() - machine.sMagnetButton.lastChange < 4000 && !machine.sShooterLane.state,
            rampUp: () => machine.lRampStartMb.is(Color.White)? false : this.rampUp,
            lShooterStartHand: () => !this.curMode || (this.poker?.step??-1) >= 7? [[Color.Green, 'fl']] : [],
            lEjectStartMode: () => (!this.curMode || this.poker) && this.modesReady.size>0? ((this.poker?.step??7) >= 7? [Color.Green] : [Color.Red]) : [],
            lRampStartMb: () => (!this.curMode || this.poker) && this.mbsReady.size>0? ((this.poker?.step??7) >= 7? [[Color.Green, 'fl']] : [Color.Red]) : [],
            lPower1: () => light(this.chips>=1, Color.Orange),
            lPower2: () => light(this.chips>=2, Color.Orange),
            lPower3: () => light(this.chips>=3, Color.Orange),
            lPower4: () => light(this.chips>=4, Color.Orange),
            lPopperStatus: () => light(this.chips>=1, Color.Green, Color.Red),
            lMagnaSaveStatus: () => light(this.chips>=1, Color.Green, Color.Red),
            shooterDiverter: () => machine.lShooterStartHand.lit()? true : undefined,
            lLaneUpper1: () => light(this.laneChips[0], Color.Orange),
            lLaneUpper2: () => light(this.laneChips[1], Color.Orange),
            lLaneUpper3: () => light(this.laneChips[2], Color.Orange),
            lLaneUpper4: () => light(this.laneChips[3], Color.Orange),
        });
        

        // natural inlane -> lower ramp
        this.listen(
            [...onSwitchClose(machine.sRightInlane), () => !machine.sShooterLower.wasClosedWithin(2000) && !machine.sShooterMagnet.wasClosedWithin(2000)],
            e => {
                this.rampUp = false;
            });
        this.listen(onAnySwitchClose(machine.sPop, machine.sLeftSling, machine.sRightSling),
            e => {
                this.rampUp = true;
                this.laneChips.rotate(1);
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
                this.addChip();             
                this.laneChips[i] = false;
                if (this.laneChips.every(c => !c)) {
                    this.laneChips.fill(true);
                    this.ball!.bonusX++;
                    alert(`bonus ${this.ball!.bonusX}X`);
                }
            });
        // award chips on bank complete
        this.listen<DropBankCompleteEvent>(e => e instanceof DropBankCompleteEvent, (e) => {
            this.ball!.miniReady = true;
            for (let i=0; i<e.bank.targets.length; i++)
                this.addChip();
        });
        // subtract chips
        this.listen([...onSwitchClose(machine.sPopperButton), () => !machine.sShooterLane.state], async () => {
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



        this.listen([...onSwitchClose(machine.sRampMade), () => machine.lRampStartMb.lit()], () => {
            return StraightMb.start(this);
        });

        this.listen(onSwitchClose(machine.sShooterLane), async () => {
            await Poker.start(this);
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
}

class NoMode extends Mode {
    constructor(
        public player: Player,
    ) {
        super(Modes.NoMode);
    }

    end() {
        return super.end();
    }
}

class Spinner extends Tree<MachineOutputs> {
    lastSpinAt?: Time;
    score = 10;
    comboMult = 1;

    rounds = 0;
    maxRounds = 1;

    display = gfx? makeText('10  ', 70, 'corner').rz(90).x(80).y(160).sy(-1) : undefined;

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
            ...onSwitchClose(machine.sLeftInlane),
            () => (!!this.lastSpinAt && time()-this.lastSpinAt < 2000) || machine.lastSwitchHit === machine.sSpinner],
        () => {
            if (this.rounds > 0)
                this.rounds--;
            this.comboMult+=2;
        });

        this.listen([onAnySwitchClose(...machine.sUpperLanes), () => this.rounds === 0], () => {
            this.rounds = this.maxRounds;
            this.maxRounds++;
            if (this.maxRounds > 3)
                this.maxRounds = 3;
        });

        this.listen(onAnySwitchClose(...machine.sUpperLanes, machine.sLeftSling, machine.sRightSling), () => this.comboMult = 1);

        this.watch(onChange(this, 'score'), () => this.updateDisplay());
        this.watch(onChange(this, 'comboMult'), () => this.updateDisplay());

        this.listen(e => e instanceof DropDownEvent, () => this.calcScore());
        this.listen(e => e instanceof DropBankResetEvent, () => this.calcScore());
    }

    hit() {
        if (!this.lastSpinAt || time()-this.lastSpinAt > 100) {
            Events.fire(new SpinnerHit());
        }
        this.player.score += this.score * this.comboMult;
    }

    updateDisplay() {
        this.display?.text(`${this.score} ${this.comboMult>1? `x${this.comboMult}` : '  '}`);
    }

    calcScore() {
        const down = [3, 2, 1].map(num => ([num, machine.dropBanks.filter(bank => bank.targets.filter(t => t.state).length === num).length]));
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
            onAnySwitchClose(machine.sShooterMagnet, machine.sShooterUpper, machine.sShooterLower),
            () => (!!machine.sLeftOrbit.lastClosed && time()-machine.sLeftOrbit.lastClosed < 2000) || machine.lastSwitchHit === machine.sLeftOrbit],
        () => {
            if (this.rounds > 0)
                this.rounds--;
            this.comboMult+=2;
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
    }
}

class PlayerOverrides extends Mode {
    constructor(public player: Player) {
        super(Modes.PlayerOverrides);
        this.out = new Outputs(this, {
            shooterDiverter: () => player.closeShooter? false : undefined,
            leftGate: () => machine.lastSwitchHit === machine.sLeftOrbit? false : undefined,
            rightGate: () => machine.lastSwitchHit === machine.sSpinner? false : undefined,
        });
    }
}