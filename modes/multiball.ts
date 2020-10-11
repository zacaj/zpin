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
import { assert, getCallerLoc } from '../util';

export abstract class Multiball extends Mode {
    balls = 1;

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
        this.balls++;
    }
    async releaseBallFromLock() {
        Log.info(['game', 'console'], 'release ball from lock via ', getCallerLoc(true));
        assert(machine.ballsLocked !== 0);
        if (machine.ballsLocked !== 'unknown')
            machine.ballsLocked--;
        this.lockPost = true;
        await wait(75, 'release lock');
        this.lockPost = false;
    }
    async releaseBallsFromLock() {
        Log.info(['game', 'console'], 'release balls from lock via ', getCallerLoc(true));
        assert(machine.ballsLocked !== 0);
        await wait(100, 'release locks');
        this.lockPost = true;
        machine.ballsLocked = 0;
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