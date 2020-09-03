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
import { Tree, TreeEvent } from '../tree';
import { Event, Events, Priorities } from '../events';
import { Time, time, wait } from '../timer';
import { makeText, gfx } from '../gfx';
import { StraightMb } from './straight.mb';
import { Multiball } from './multiball';
import { fork } from '../promises';
import { PlayerGfx } from '../gfx/player';
import { ClearHoles, ResetMechs } from '../util-modes';
import { assert } from '../util';
import { Rng } from '../rand';
import { MPU } from '../mpu';
import { GameMode } from './game-mode';

export class Player extends Mode<MachineOutputs> {
    chips = 1;
    score = 0;
    
    poker?: Poker;
    curMbMode?: Mode;
    get curMode() {
        return this.poker ?? this.curMbMode;
    }
  
    get ball(): Ball {
        return this.children.find(c => c instanceof Ball) as Ball;
    }

    lowerRampLit = false;
    rampUp = true;

    modesQualified = new Set<(number)>();
    mbsQualified = new Map<'StraightMb'|'FlushMb', Card[]>();

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
        State.declare<Player>(this, ['rampUp', 'score', 'chips', 'lowerRampLit', 'modesQualified', 'mbsQualified', 'poker', 'closeShooter', 'curMbMode']);
        this.out = new Outputs(this, {
            leftMagnet: () => machine.sMagnetButton.state && time() - machine.sMagnetButton.lastChange < 4000 && !machine.sShooterLane.state,
            rampUp: () => machine.lRampStartMb.is(Color.White)? false : this.rampUp,
            lLowerRamp: () => this.lowerRampLit? [Color.White] : [],
            lShooterStartHand: () => !this.curMode || (this.poker?.step??-1) >= 7? [Color.White] : [],
            lEjectStartMode: () => (!this.curMode || this.poker) && this.modesReady.size>0? ((this.poker?.step??7) >= 7? [Color.White] : [Color.Red]) : [],
            lRampStartMb: () => (!this.curMode || this.poker) && this.mbsReady.size>0? ((this.poker?.step??7) >= 7? [Color.White] : [Color.Red]) : [],
            lPower1: () => light(this.chips>=1, Color.Orange),
            lPower2: () => light(this.chips>=2, Color.Orange),
            lPower3: () => light(this.chips>=3, Color.Orange),
            lPower4: () => light(this.chips>=4, Color.Orange),
            lPopperStatus: () => light(this.chips>=1, Color.Green, Color.Red),
            lMagnaSaveStatus: () => light(this.chips>=1, Color.Green, Color.Red),
            shooterDiverter: () => machine.lShooterStartHand.lit()? true : undefined,
        });
        
        this.addChild(new ClearHoles(), -1);

        this.listen(e => e instanceof TreeEvent, () => this.curMbMode = this.getChildren().find(x => x instanceof Multiball || x instanceof GameMode) as Mode);

        this.listen(
            [...onSwitchClose(machine.sRightInlane), () => machine.sShooterLower.wasClosedWithin(2000) || machine.sShooterMagnet.wasClosedWithin(2000)],
            e => {
                this.rampUp = false;
            });
        this.listen(
            [...onSwitchClose(machine.sRightInlane), () => this.lowerRampLit],
            e => {
                this.rampUp = false;
            });
        this.listen(onAnySwitchClose(machine.sPop, machine.sLeftSling, machine.sRightSling),
            e => {
                this.rampUp = true;
                this.lowerRampLit = !this.lowerRampLit;
            });

        this.listen(
            onAnySwitchClose(machine.sRampMini, machine.sRampMiniOuter, machine.sSpinnerMini, machine.sSidePopMini, machine.sUpperPopMini, ...machine.sTopLanes),
            () => {
                if (this.chips < 4)
                    this.chips++;
                else 
                    this.store.Poker.bank += 50;
            });
        this.listen([...onSwitchClose(machine.sPopperButton), () => !machine.sShooterLane.state], async () => {
            if (this.chips === 0) return;
            await machine.cPopper.fire();
            if (time() - (machine.cPopper.lastFired??time()) > 100) return;
            this.chips-=2;
            if (this.chips<0) this.chips = 0;
        });
        
        this.listen([...onSwitchClose(machine.sMagnetButton), () => !machine.sShooterLane.state], async () => {
            if (this.chips === 0) return;
            this.chips--;
        });

        

        this.listen([onAnySwitchClose(machine.sShooterUpper)], () => this.closeShooter = true);
        this.listen(onAnyPfSwitchExcept(machine.sShooterUpper, machine.sShooterMagnet, machine.sShooterLower), () => this.closeShooter = false);

        
        this.listen(e => e instanceof DropBankCompleteEvent, () => this.ball.miniReady = true);

        this.listen([...onSwitchClose(machine.sRampMade), () => machine.lRampStartMb.lit()], () => {
            fork(StraightMb.start(this));
        });

        this.listen(onSwitchClose(machine.sShooterLane), async () => {
            const finish = await Events.tryPriority(Priorities.StartPoker);
            if (!finish) return;

            if (!this.curMode) {
                this.poker = new Poker(this);
                this.addChild(this.poker);
                if (MPU.isConnected || gfx) {
                    await this.await(this.addChild(new ResetMechs()).onEnd());
                }
                await wait(500);
            }
            finish();
        });
        
        this.poker = new Poker(this);
        this.addChild(this.poker);

        this.addChild(new Spinner(this));

        this.addChild(new PlayerOverrides(this));

        this.gfx?.add(new PlayerGfx(this));
    }

    rng(): Rng {
        return new Rng(this.seed);
    }

    
    startBall() {
        this.addChild(new Ball(this));
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
            rightGate: () => machine.lastSwitchHit === machine.sSpinner? false : undefined,
            iSpinner: () => this.display,
        });

        this.listen(onSwitchClose(machine.sSpinner), 'hit');

        this.listen([...onSwitchClose(machine.sLeftOrbit), () => !!this.lastSpinAt && time()-this.lastSpinAt < 1200],
        () => {
            if (this.rounds > 0)
                this.rounds--;
            this.comboMult+=2;
        });

        this.listen([onAnySwitchClose(...machine.sTopLanes), () => this.rounds === 0], () => {
            this.rounds = this.maxRounds;
            this.maxRounds++;
            if (this.maxRounds > 3)
                this.maxRounds = 3;
        });

        this.listen(onAnySwitchClose(...machine.sTopLanes, machine.sLeftSling, machine.sRightSling), () => this.comboMult = 1);

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

class PlayerOverrides extends Mode<MachineOutputs> {
    constructor(public player: Player) {
        super(Modes.PlayerOverrides);
        this.out = new Outputs(this, {
            shooterDiverter: () => player.closeShooter? false : undefined,
        });
    }
}