import { Mode, Modes } from '../mode';
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
import { Player } from './player';

export abstract class Multiball extends Mode {
    balls = 1; // balls that need to drain to end mode

    lockPost? = false;

    protected constructor(
        public player: Player,
        public isRestarted = false,
        ballsOnPf = 1, // not in trough
    ) {
        super(Modes.Multiball);
        this.balls = ballsOnPf;

        State.declare<Multiball>(this, ['lockPost']);

        this.listen(onSwitchClose(machine.sOuthole), 'ballDrained');

        this.out = new Outputs(this, {
            miniDiverter: false,
            lMiniReady: [],
            lockPost: () => this.lockPost,
            shooterDiverter: false,
        }, true);
    }

    async start() {
        if (MPU.isConnected || gfx) {
            await ResetMechs(this);
        }
    }

    async releaseBallFromTrough() {
        if (MPU.isConnected || gfx) {
            await ReleaseBall(this);
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
        this.lockPost = undefined;
    }

    firstSwitchHit(): 'remove'|undefined {
        return 'remove';
    }

    async lastBallDrained() {
        return this.end();
    }

    ballDrained() {
        this.balls--;
        Log.log('game', 'lost ball from multiball, now at %i balls', this.balls);
        if (this.balls <= 1) {
            Log.log('game', 'multiball over');
            return this.lastBallDrained();
        }

        return undefined;
    }
}