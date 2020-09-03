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

export class Ball extends Mode<MachineOutputs> {
    get skillshot(): Skillshot|undefined {
        return this.children.find(c => c instanceof Skillshot) as Skillshot;
    }

    constructor(
        public player: Player,
    ) {
        super(Modes.Ball);
        
        this.listen(onAnySwitchClose(machine.sShooterLane), () => {
            fork(Skillshot.start(this));
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