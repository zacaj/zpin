import { Mode } from '../mode';
import { MachineOutputs, machine } from '../machine';
import { MPU } from '../mpu';
import { gfx } from '../gfx';
import { ResetMechs, ReleaseBall } from '../util-modes';
import { onSwitchClose, onAnyPfSwitchExcept } from '../switch-matrix';
import { Log } from '../log';
import { Outputs } from '../outputs';
import { State } from '../state';
import { wait } from '../timer';
import { fork } from '../promises';

export abstract class Multiball extends Mode<MachineOutputs> {

    balls = 1;

    lockPost = false;

    constructor(
        ballsOnPf = 1,
    ) {
        super();
        this.balls = ballsOnPf;

        State.declare<Multiball>(this, ['lockPost']);

        this.listen(onSwitchClose(machine.sOuthole), 'ballDrained');

        this.out = new Outputs(this, {
            miniDiverter: false,
            lockPost: () => this.lockPost,
            shooterDiverter: false,
        });

        fork(this.start());
    }

    async start() {
        if (MPU.isConnected || gfx) {
            await this.await(this.addChild(new ResetMechs()).onEnd());
        }
    }

    async releaseBallFromTrough() {
        if (MPU.isConnected || gfx) {
            await this.await(this.addChild(new ReleaseBall()).onEnd());
        }
        this.listen(onAnyPfSwitchExcept(machine.sShooterLower), 'firstSwitchHit');
    }
    async releaseBallFromLock() {
        this.lockPost = true;
        await wait(50, 'release lock');
        this.lockPost = false;
    }
    async releaseBallsFromLock() {
        this.lockPost = true;
        await wait(1200, 'release locks');
        this.lockPost = false;
    }

    firstSwitchHit(): 'remove'|undefined {
        return 'remove';
    }

    ballDrained() {
        this.balls--;
        Log.log('game', 'lost ball from multiball, now at %i balls', this.balls);
        if (this.balls <= 1) {
            Log.log('game', 'multiball over');
            return this.end();
        }

        return undefined;
    }
}