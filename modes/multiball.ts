import { Mode, Modes } from '../mode';
import { MachineOutputs, machine } from '../machine';
import { MPU } from '../mpu';
import { gfx } from '../gfx';
import { ResetMechs, ReleaseBall, MiscAwards } from '../util-modes';
import { onSwitchClose, onAnyPfSwitchExcept } from '../switch-matrix';
import { Log } from '../log';
import { Outputs } from '../outputs';
import { State } from '../state';
import { Time, time, wait } from '../timer';
import { fork } from '../promises';
import { Difficulty, Player } from './player';
import { assert, getCallerLoc } from '../util';
import { Color } from '../light';
import { stopMusic } from '../sound';

export abstract class Multiball extends Mode {
    get nodes() {
        return [
            this.misc,
            ...this.tempNodes,
        ].truthy();
    }

    balls = 1;

    lockPost? = false;

    misc?: MiscAwards;

    multiStartTime?: Time;
    get saveFreq() {
        if (!this.multiStartTime) return 0.25;
        if (time() - this.multiStartTime < this.saverTime-15000) return .5;
        if (time() - this.multiStartTime < this.saverTime-5000) return 1;
        return 2;
    }

    get saverTime() {
        if (this.player.difficulty===Difficulty.Zac)
            return 0;
        if (this.player.difficulty===Difficulty.Expert)
            return 20000;
        if (this.player.difficulty<=Difficulty.Casual)
            return 2400000;
        return 30000;
    }

    protected constructor(
        public player: Player,
        public isRestarted = false,
        ballsOnPf = 1, // not in trough
    ) {
        super(Modes.Multiball);
        this.balls = ballsOnPf;

        State.declare<Multiball>(this, ['lockPost', 'multiStartTime']);

        this.listen(onSwitchClose(machine.sOuthole), 'ballDrained');

        this.misc = new MiscAwards(player);
        // this.misc.addTargets(3);

        this.out = new Outputs(this, {
            lMiniReady: [[Color.Gray, 'pl', .25, 1]],
            lockPost: () => this.lockPost,
            shooterDiverter: false,
            lPower1: () => !this.multiStartTime||time()-this.multiStartTime<this.saverTime? [[Color.Gray, 'pl', this.saveFreq]] : undefined,
            lPower2: () => !this.multiStartTime||time()-this.multiStartTime<this.saverTime? [[Color.Gray, 'pl', this.saveFreq, 1]] : undefined,
            lPower3: () => !this.multiStartTime||time()-this.multiStartTime<this.saverTime? [[Color.Gray, 'pl', this.saveFreq]] : undefined,
            lMagnet1: () => !this.multiStartTime||time()-this.multiStartTime<this.saverTime? [[Color.Gray, 'pl', this.saveFreq]] : undefined,
            lMagnet2: () => !this.multiStartTime||time()-this.multiStartTime<this.saverTime? [[Color.Gray, 'pl', this.saveFreq, 1]] : undefined,
            lMagnet3: () => !this.multiStartTime||time()-this.multiStartTime<this.saverTime? [[Color.Gray, 'pl', this.saveFreq]] : undefined,
            lPopperStatus: () => !this.multiStartTime||time()-this.multiStartTime<this.saverTime? [[Color.Gray, 'pl', this.saveFreq, 1]] : undefined,
        }, true);
    }

    async start() {
        if (MPU.isLive || gfx) {
            await ResetMechs(this);
        }
    }

    async releaseBallFromTrough() {
        if (MPU.isLive || gfx) {
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
        if (!this.multiStartTime)
            this.multiStartTime = time();

        Log.info(['game', 'console'], 'release balls from lock via ', getCallerLoc(true));
        assert(machine.ballsLocked !== 0);
        this.lockPost = true;
        await wait(75, 'release lock');
        this.lockPost = false;

        await wait(250, 'release locks');
        this.lockPost = true;
        machine.ballsLocked = 0;
        await wait(1200, 'release locks');
        this.lockPost = undefined;
    }

    firstSwitchHit(): 'remove'|undefined {
        return 'remove';
    }

    async lastBallDrained() {
        // void stopMusic();
        return this.end();
    }

    async ballDrained() {
        if (this.player.ball?.shootAgain) {
            await ReleaseBall(this);
            this.player.ball.shootAgain = false;
            return;
        }

        this.balls--;
        Log.log('game', 'lost ball from multiball, now at %i balls', this.balls);
        if (this.balls <= 1) {
            Log.log('game', 'multiball over');
            return this.lastBallDrained();
        }

        return undefined;
    }
}