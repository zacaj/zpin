import { Mode, Modes } from '../mode';
import { MachineOutputs, machine } from '../machine';
import { Skillshot } from './skillshot';
import { onAnySwitchClose, onSwitchClose } from '../switch-matrix';
import { ResetAnyDropOnComplete, ResetMechs, ReleaseBall } from '../util-modes';
import { Event, Events } from '../events';
import { Player } from './player';
import { MPU } from '../mpu';
import { gfx } from '../gfx';
import { fork } from '../promises';
import { wait } from '../timer';
import { State } from '../state';
import { Outputs } from '../outputs';
import { Color } from '../light';
import { MiniPf } from './miniPf';

export class Ball extends Mode {

    miniReady = false;

    resetDrops = new ResetAnyDropOnComplete();

    skillshot?: Skillshot;
    miniPf?: MiniPf;

    get children() {
        return [
            this.resetDrops,
            this.skillshot,
            this.miniPf,
            ...this.tempNodes,
        ].truthy();
    }

    private constructor(
        public player: Player,
    ) {
        super(Modes.Ball);
        State.declare<Ball>(this, ['miniReady']);
        this.out = new Outputs(this, {
            lMiniReady: () => this.miniReady? [Color.Green] : [Color.Red],
        });
        
        this.listen(onAnySwitchClose(machine.sShooterLane), () => {
            fork(Skillshot.start(this));
        });

        this.listen([...onSwitchClose(machine.sLeftOutlane), () => machine.lMiniReady.is(Color.Green)], () => {
            this.miniPf = new MiniPf(this);
            this.miniPf.started();
        });

        this.listen(onSwitchClose(machine.sTroughFull), 'end');
    }

    static async start(player: Player) {
        const ball = new Ball(player);
        
        player.ball = ball;

        ball.started();
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