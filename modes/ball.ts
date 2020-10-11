import { Mode, Modes } from '../mode';
import { MachineOutputs, machine } from '../machine';
import { Skillshot } from './skillshot';
import { onAnySwitchClose, onSwitchClose } from '../switch-matrix';
import { ResetAnyDropOnComplete, ResetMechs, ReleaseBall } from '../util-modes';
import { Event, Events, Priorities } from '../events';
import { Player } from './player';
import { MPU } from '../mpu';
import { addToScreen, gfx, ModeGroup, textBox } from '../gfx';
import { fork } from '../promises';
import { wait } from '../timer';
import { State } from '../state';
import { Outputs } from '../outputs';
import { Color } from '../light';
import { MiniPf } from './miniPf';
import { DropBankCompleteEvent, DropDownEvent } from '../drop-bank';
import { Bonus } from './bonus';
import { EndOfGameBonus, EogGfx } from './eog';
import { Poker } from './poker';

export class Ball extends Mode {

    resetDrops = new ResetAnyDropOnComplete();

    skillshot?: Skillshot;
    miniPf?: MiniPf;
    bonus?: Bonus;
    eog?: EndOfGameBonus;

    bonusX = 1;

    drops = 0;
    banks = 0;
    targets = 0;
    ramps = 0;
    spins = 0;
    lanes = 0;

    tilted = false;
    drained = false;

    get children() {
        return [
            this.resetDrops,
            this.skillshot,
            this.miniPf,
            ...this.tempNodes,
            this.bonus,
            this.eog,
        ].truthy();
    }

    private constructor(
        public player: Player,
    ) {
        super(Modes.Ball);
        State.declare<Ball>(this, ['skillshot', 'tilted', 'drained']);
        this.out = new Outputs(this, {
            miniFlipperEnable: () => !this.drained,
            kickerEnable: () => !this.drained,
        });
        
        this.listen(onAnySwitchClose(machine.sShooterLane), () => {
            fork(Skillshot.start(this));
        });

        this.listen([...onSwitchClose(machine.sLeftOutlane), () => machine.lMiniReady.is(Color.Green)], () => {
            this.miniPf = new MiniPf(this);
            this.miniPf.started();
        });

        this.listen(onSwitchClose(machine.sTroughFull), async () => {
            Events.fire(new BallEnding(this));
            this.gfx?.clear();
            const finish = await Events.waitPriority(Priorities.EndBall);
    
            this.bonus = new Bonus(this);
            this.bonus.started();
            await this.await(this.bonus.onEnding);
            if (player.game.ballNum === player.game.ballCount) {
                this.eog = new EndOfGameBonus(this.player);
                this.eog.started();
                await this.await(this.eog.onEnding);
            }
            finish();
            return this.end();
        });

        this.listen(e => e instanceof DropDownEvent, () => this.drops++);
        this.listen(e => e instanceof DropBankCompleteEvent, () => this.banks++);
        this.listen(onSwitchClose(machine.sSpinner), () => this.spins++);
        this.listen(onSwitchClose(machine.sRampMade), () => this.ramps++);
        this.listen(onAnySwitchClose(...machine.sStandups), () => this.targets++);
        this.listen(onAnySwitchClose(...machine.sLanes), () => this.lanes++);

        this.listen(onSwitchClose(machine.sMiniOut), () => this.drained = true);

        this.listen(onSwitchClose(machine.sTilt), () => {
            this.tilted = true;
            this.gfx?.add(textBox({}, ['TILT', 150]).z(100));
        });
        addToScreen(() => new ModeGroup(this));
    }

    static async start(player: Player) {
        const ball = new Ball(player);
        
        player.ball = ball;

        ball.started();

        if (player.focus === player.noMode) {
            await Poker.start(player);
        }

        if (MPU.isConnected || gfx) {
            await ResetMechs(ball);
            await ReleaseBall(ball);
        }
        Events.fire(new BallStart(ball));

        if (player.chips === 0)
            player.chips++;

        return ball;
    }

    end() {
        fork(wait(1).then(() => Events.fire(new BallEnd(this))));
        return super.end();
    }
}

export class BallStart extends Event {
    constructor(
        public ball: Ball,
    ) {
        super();
    }
}

export class BallEnd extends Event {
    constructor(
        public ball: Ball,
    ) {
        super();
    }
}

export class BallEnding extends Event {
    constructor(
        public ball: Ball,
    ) {
        super();
    }
}