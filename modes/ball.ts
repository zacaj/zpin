import { Mode, Modes } from '../mode';
import { MachineOutputs, machine } from '../machine';
import { Skillshot } from './skillshot';
import { onAnyPfSwitchExcept, onAnySwitchClose, onSwitchClose } from '../switch-matrix';
import { ResetAnyDropOnComplete, ResetMechs, ReleaseBall, AllLights } from '../util-modes';
import { Event, Events, Priorities } from '../events';
import { Difficulty, Player } from './player';
import { MPU } from '../mpu';
import { addToScreen, alert, gfx, ModeGroup, Screen, textBox } from '../gfx';
import { fork } from '../promises';
import { time, wait } from '../timer';
import { onChange, State } from '../state';
import { Outputs } from '../outputs';
import { Color, flash } from '../light';
import { MiniPf } from './miniPf';
import { DropBankCompleteEvent, DropDownEvent } from '../drop-bank';
import { Bonus } from './bonus';
import { EndOfGameBonus, EogGfx } from './eog';
import { Poker } from './poker';
import { Group } from 'aminogfx-gl';
import { Tree, TreeEndEvent } from '../tree';
import { playSound, playVoice, stopSounds } from '../sound';
import { HighscoreEntry } from './highscore.mode';

export class Ball extends Mode {

    resetDrops = new ResetAnyDropOnComplete();

    skillshot?: Skillshot;
    miniPf?: MiniPf;
    bonus?: Bonus;
    eog?: EndOfGameBonus;
    drainEffect?: Tree<MachineOutputs>;

    bonusX = 1;

    drops = 0;
    banks = 0;
    targets = 0;
    ramps = 0;
    spins = 0;
    slings = 0;
    lanes = 0;
    multiballs = 0;

    tilted = false;
    drained = false;
    shootAgain = false;
    validated = false;

    validateTime = this.startTime;

    override get nodes() {
        return [
            this.resetDrops,
            this.skillshot,
            this.miniPf,
            ...this.tempNodes,
            this.drainEffect,
            this.bonus,
            this.eog,
        ].truthy();
    }

    private constructor(
        public player: Player,
    ) {
        super(Modes.Ball);
        State.declare<Ball>(this, ['skillshot', 'tilted', 'drained', 'shootAgain', 'validated']);
        this.out = new Outputs(this, {
            miniFlipperEnable: () => !this.drained && !this.shootAgain && !this.tilted,
            kickerEnable: () => !this.drained && !this.shootAgain && !this.tilted,
            lShootAgain: () => flash(this.shootAgain, Color.Orange),
            music: () => this.tilted? null : machine.sShooterLane.state || (machine.lastSwitchHit===machine.sOuthole && machine.ballsInPlay<1) || !this.validated? undefined : 'green grass slow with start', 
            ballSave: () => this.shootAgain,
        });
        
        this.listen(onAnySwitchClose(machine.sShooterLane), () => {
            fork(Skillshot.start(this));
        });

        this.listen([...onSwitchClose(machine.sLeftOutlane), () => machine.lMiniReady.lit() && !machine.lMiniReady.is(Color.Red) && !this.shootAgain], () => {
            this.miniPf = new MiniPf(this);
            this.miniPf.started();
        });

        this.listen(onSwitchClose(machine.sOuthole), async () => {
            this.drainEffect?.end();
            this.drainEffect = undefined;
            await stopSounds();
            await playSound('drop spin');
            if (machine.ballsLocked > 0 || !machine.sDetect3.state) {
                await this.saveBall();
            }
            else if (machine.sRightOutlane.wasClosedWithin(1000) && !machine.sPopperButton.wasClosedWithin(1000) && this.player.chips>0 && !this.shootAgain && !this.tilted) {
                await alert('USE RIGHT BUTTON TO SAVE BALL', 3000)[1];
                this.player.audit('right ball save not used');
            }
        });

        this.listen(onSwitchClose(machine.sTroughFull), async () => {
            if (this.shootAgain || machine.out!.treeValues.ballSave || !machine.sDetect3.state) {
                await this.saveBall();
                return;
            }

            const finish = await Events.tryPriority(Priorities.EndBall);
            if (!finish) return;
            Events.fire(new BallEnding(this));
            this.gfx?.clear();
    
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
        this.listen(onSwitchClose(machine.sRampMade), () => void playSound('ramp'));
        this.listen(onAnySwitchClose(...machine.sStandups), () => this.targets++);
        this.listen(onAnySwitchClose(...machine.sLanes), () => this.lanes++);
        this.listen(onAnySwitchClose(machine.sLeftSling, machine.sRightSling), () => this.slings++);
        // this.listen(onAnySwitchClose(...machine.sStandups), () =>
        //     void playSound('bop'));
        // this.listen(onAnySwitchClose(...machine.sLanes), () => 
        //     void playSound('bop'));

        this.listen([...onSwitchClose(machine.sMiniOut), () => !this.player.curMbMode], () => {
            if (!this.shootAgain && !this.drained)
                void playVoice("crowd groan");
            this.drained = true;
            // this.drainEffect = AllLights(this) as Tree<MachineOutputs>;
        });

        addToScreen(() => new ModeGroup(this));

        this.listen(onSwitchClose(machine.sTilt), () => {
            this.tilted = true;
            this.gfx?.add(textBox({}, ['TILT', 150]).z(100));
        });

        if (this.gfx) {
            const tb = textBox({maxWidth: Screen.w}, ['BALL SAVED', 150, 80], ['PLEASE WAIT', 70]).z(100);
            this.gfx.add(tb);
            this.watch(() => tb.visible(this.shootAgain));
        }

    }

    static async start(player: Player) {
        Events.resetPriorities();
        const ball = new Ball(player);
        
        player.ball = ball;
        ball.parent = player;

        ball.started();

        if (player.noMode) {
            await Poker.start(player);
        }

        if (player.game.ballNum === 2)
            player.audit('Difficulty: ' + Difficulty[player.difficulty]);

        if (MPU.isLive || gfx) {
            await ResetMechs(ball);
            await ball.releaseBall();
        }
        Events.fire(new BallStart(ball));

        if (player.chips === 0)
            player.chips = 1;
        // player.chips = player.startingChips;
        if (player.difficulty <= Difficulty.Normal)
            player.miniReady = true;

        return ball;
    }

    override end() {
        this.drainEffect?.end();
        this.drainEffect = undefined;
        fork(wait(1).then(() => Events.fire(new BallEnd(this))));
        this.player.audit('ball time (s)', (time()-this.validateTime)/1000);
        this.player.ballTimes.push((time()-this.validateTime)/1000);
        return super.end();
    }

    async releaseBall() {
        this.validated = false;
        this.listen(onAnyPfSwitchExcept(machine.sShooterLane, machine.sRightOutlane, machine.sLeftOutlane, machine.sOuthole, machine.sMiniOut), () => {
            this.validated = true;
            this.validateTime = time();
            return 'remove';
        });
        fork(Skillshot.start(this));
        await ReleaseBall(this);
    }

    async saveBall() {
        Events.fire(new BallSaved(this));
        await this.releaseBall();
        this.shootAgain = false;
        this.drained = false;
        this.tilted = false;
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

export class BallSaved extends Event {
    constructor(
        public ball: Ball,
    ) {
        super();
    }
}