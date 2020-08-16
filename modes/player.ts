import { MachineOutputs, machine, Machine } from '../machine';
import { Mode, Modes } from '../mode';
import { Poker } from './poker';
import { State, onChange } from '../state';
import { Game } from '../game';
import { Outputs } from '../outputs';
import { Color, light } from '../light';
import { onSwitchClose, onAnySwitchClose } from '../switch-matrix';
import { DropBankCompleteEvent, DropDownEvent, DropBankResetEvent } from '../drop-bank';
import { Ball } from './ball';
import { Tree } from '../tree';
import { Event, Events } from '../events';
import { Time, time, wait } from '../timer';
import { makeText, gfx } from '../gfx';
import { StraightMb } from './straight.mb';
import { Multiball } from './multiball';
import seedrandom = require('seedrandom');
import { fork } from '../promises';

export class Player extends Mode<MachineOutputs> {
    chips = 1;
    score = 0;
    bank = 10000;
    
    poker?: Poker;

    get curMode(): Mode<MachineOutputs>|undefined {
        return this.poker ??
            this.allChildren.find(c => c instanceof Multiball) as Multiball;
    }

    get ball(): Ball {
        return this.children.find(c => c instanceof Ball) as Ball;
    }

    lowerRampLit = false;
    miniReady = false;
    rampUp = true;

    modesQualified = new Set<(number)>();
    mbsQualified = new Set<(typeof Multiball)>();

    rand!: seedrandom.prng;

    constructor(
        public game: Game,
        seed = 'pinball',
    ) {
        super(Modes.Player);
        State.declare<Player>(this, ['rampUp', 'miniReady', 'score', 'chips', 'lowerRampLit', 'modesQualified', 'mbsQualified', 'poker']);
        this.out = new Outputs(this, {
            leftMagnet: () => machine.sMagnetButton.state && time() - machine.sMagnetButton.lastChange < 4000,
            rampUp: () => machine.lRampStartMb.is(Color.White)? false : this.rampUp,
            lMiniReady: () => this.miniReady? [Color.Green] : undefined,
            lLowerRamp: () => this.lowerRampLit? [Color.White] : [],
            lShooterStartHand: () => this.poker?.step === 7? [Color.White] : [],
            lEjectStartMode: () => this.modesQualified.size>0? ((this.poker?.step??7) === 7? [Color.White] : [Color.Red]) : [],
            lRampStartMb: () => this.mbsQualified.size>0? ((this.poker?.step??7) === 7? [Color.White] : [Color.Red]) : [],
            lPower1: () => light(this.chips>=1, Color.Orange),
            lPower2: () => light(this.chips>=2, Color.Orange),
            lPower3: () => light(this.chips>=3, Color.Orange),
            lPower4: () => light(this.chips>=4, Color.Orange),
        });
        this.rand = seedrandom(seed);

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
            onAnySwitchClose(machine.sRampMini, machine.sRampMiniOuter, machine.sSpinnerMini, machine.sSidePopMini, machine.sUpperPopMini),
            () => {
                this.chips++;
                if (this.chips > 4) this.chips--;   
            });
        this.listen(onSwitchClose(machine.sPopperButton), async () => {
            if (this.chips === 0) return;
            const fired = await machine.cPopper.fire();
            this.chips-=2;
            if (this.chips<0) this.chips = 0;
        });
        
        this.listen(onSwitchClose(machine.sMagnetButton), async () => {
            if (this.chips === 0) return;
            this.chips--;
        });
        
        this.listen(e => e instanceof DropBankCompleteEvent, () => this.miniReady = true);
        this.listen(onAnySwitchClose(machine.sMiniEntry), () => this.miniReady = false);

        this.listen([...onSwitchClose(machine.sRampMade), () => machine.lRampStartMb.lit()], async () => {
            const finish = await fork(Events.waitPriority(2));
            if (!this.curMode) {
                this.ball.addChild(await fork(StraightMb.start(this)));
                this.mbsQualified.delete(StraightMb);
            }
            finish();
        });

        this.listen(onSwitchClose(machine.sShooterLane), async () => {
            const finish = await Events.waitPriority(2);
            if (!this.curMode) {
                this.poker = new Poker(this);
                this.addChild(this.poker);
                await wait(500);
            }
            finish();
        });
        
        this.poker = new Poker(this);
        this.addChild(this.poker);

        this.addChild(new Spinner(this));
    }
    
    startBall() {
        this.addChild(new Ball(this));
    }

    weightedRand(...weights: number[]): number {
        let sum = weights.reduce((prev, cur) => prev+cur, 0);
        const rand = Math.floor(this.rand()*sum);
        for (let i=0; i<weights.length; i++) {
            sum -= weights[i];
            if (sum <= rand) return i;
        }
        return weights.length - 1;
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