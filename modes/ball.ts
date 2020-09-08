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

export class Ball extends Mode<MachineOutputs> {

    miniReady = false;

    get skillshot(): Skillshot|undefined {
        return this.children.find(c => c instanceof Skillshot) as Skillshot;
    }

    constructor(
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
            this.addChild(new MiniPf(this));
        });

        fork(this.start());
    }

    async start() {
        if (MPU.isConnected || gfx) {
            await this.await(this.addChild(new ResetMechs()).onEnd());
            await this.await(this.addChild(new ReleaseBall()).onEnd());
        }
        
        this.addChild(new ResetAnyDropOnComplete(), -1);
        this.listen(onSwitchClose(machine.sTroughFull), 'end');


        Events.fire(new BallStart(this));
        if (this.player.chips === 0)
            this.player.chips++;
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