import { SwitchEvent, onSwitchClose, onAnySwitchClose, resetSwitchMatrix, onAnyPfSwitchExcept, Switch, onClose } from './switch-matrix';
import { Events, onType, Event } from './events';
import { State, StateEvent, onChange } from './state';
import { machine, MachineOutputs, resetMachine } from './machine';
import { Mode, Modes } from './mode';
import { Outputs, toggle } from './outputs';
import { time, safeSetTimeout, Timer } from './timer';
import { ClearHoles, ResetAnyDropOnComplete, KnockTarget } from './util-modes';
import { initMachine } from './init';
import { Log } from './log';
import { DropBankCompleteEvent } from './drop-bank';
import { GameGfx } from './gfx/game';
import { screen, alert, gfx, addToScreen } from './gfx';
import { Player } from './modes/player';
import { assert } from './util';
import { Ball } from './modes/ball';
import { StraightMb } from './modes/straight.mb';
import { fork } from './promises';
import { Tree, TreeChangeEvent } from './tree';

export class Game extends Mode {
    get children() {
        return [this.curPlayer, ...this.tempNodes];
    }

    players = [new Player(this, 1)];
    playerUp = 0;
    get curPlayer(): Player {
        return this.players[this.playerUp];
    }
    ballNum = 1;
    ballCount = 3;

    get ball() {
        return this.curPlayer.ball;
    }
    
    
    private constructor() {
        super(Modes.Game);
        // assert(machine.sTroughFull.state);
        State.declare<Game>(this, ['ballNum', 'playerUp']);

        this.out = new Outputs(this, {
            kickerEnable: true,
            // magnetPost: () => machine.sShooterUpper.wasClosedWithin(500) && !machine.sShooterLower.wasClosedWithin(750),
            // upperMagnet: () => machine.sShooterUpper.wasClosedWithin(5000) && !machine.sShooterLower.wasClosedWithin(750) && !machine.sSpinner.wasClosedWithin(750),
        });

        this.listen(onSwitchClose(machine.sStartButton), 'addPlayer');
        

        // this.listen(onSwitchClose(machine.sLeftInlane),
        //     () => this.addTemp(new KnockTarget()));

        this.listen(onClose(), (e) => this.curPlayer.score += this.scores.get(e.sw) ?? 0);

        addToScreen(() => new GameGfx(this));
    }

    async onBallEnd() {
        const lastPlayer = this.curPlayer;
        if (this.playerUp+1 < this.players.length)
            this.playerUp++;
        else {
            this.playerUp = 0;
            this.ballNum++;
            if (this.ballNum > this.ballCount) {
                alert('GAME OVER', 5000);
            //     if (require.main === module) {
            //         debugger;
            //         process.exit(0);
            //     }
            //     else
            //         this.end();
            }
        }
        Log.log('console', 'player %i starting ball %i', this.curPlayer.number, this.ballNum);
        Events.fire(new TreeChangeEvent(this));
        await this.curPlayer.startBall();
    }

    static async start(): Promise<Game> {
        const game = new Game();
        machine.game = game;
        game.started();
        game.curPlayer.started();
        await game.curPlayer.startBall();
        return game;
    }

    addPlayer() {
        if (!machine.sShooterLane.state || this.ballNum > 1) return;
        this.players.push(new Player(this, this.players.length+1));
        alert(`PLAYER ${this.players.length} ADDED`);
    }

    scores = new Map<Switch, number>([
        [machine.sLeftInlane,       1000],
        [machine.sLeftOutlane,      10000],
        [machine.sRightInlane,      1000],
        [machine.sRightOutlane,     10000],
        [machine.sMiniOut,          0],
        [machine.sOuthole,          0],
        [machine.sTroughFull,       0],
        [machine.sLeftSling,        10],
        [machine.sRightSling,       100],
        [machine.sMiniLeft,         25000],
        [machine.sMiniCenter,       25000],
        [machine.sMiniRight,        25000],
        [machine.sCenterLeft,       9000],
        [machine.sCenterCenter,     9000],
        [machine.sCenterRight,      9000],
        [machine.sLeft1,            6000],
        [machine.sLeft2,            6000],
        [machine.sLeft3,            6000],
        [machine.sLeft4,            6000],
        [machine.sRight1,           6000],
        [machine.sRight2,           6000],
        [machine.sRight3,           6000],
        [machine.sRight4,           6000],
        [machine.sRight5,           6000],
        [machine.sLeftBack1,        25000],
        [machine.sLeftBack2,        25000],
        [machine.sCenterBackLeft,   1000],
        [machine.sCenterBackCenter, 1000],
        [machine.sCenterBackRight,  1000],
        [machine.sUpper3Left,       12000],
        [machine.sUpper3Center,     12000],
        [machine.sUpper3Right,      12000],
        [machine.sUpper2Left,       12000],
        [machine.sUpper2Right,      12000],
        [machine.sSingleStandup,    13000],
        [machine.sRampMini,         3000],
        [machine.sRampMiniOuter,    3000],
        [machine.sRampDown,         0],
        [machine.sUnderRamp,        0],
        [machine.sLeftOrbit,        5000],
        [machine.sSpinner,          0],
        [machine.sSpinnerMini,      3000],
        [machine.sUpperPopMini,     3000],
        [machine.sSidePopMini,      3000],
        [machine.sShooterUpper,     10],
        [machine.sShooterMagnet,    10],
        [machine.sShooterLane,      0],
        [machine.sShooterLower,     10],
        [machine.sBackLane,         1000],
        [machine.sPop,              7500],
        [machine.sUpperInlane,      1000],
        [machine.sUnderUpperFlipper,25000],
        [machine.sUpperSideTarget,  15000],
        [machine.sUpperEject,       1000],
        [machine.sUpperLane2,    1000],
        [machine.sUpperLane3,   1000],
        [machine.sUpperLane4,    1000],
        [machine.sRampMade,         5000],
    ]);
}

if (require.main === module) {
fork(initMachine(true, true, true)).then(() => {
    // Log.log(['console'], 'starting game...');
    // const game = Game.start();

    // safeSetTimeout(() => {
    //     for (let i=0; i<100; i++) {
    //     Log.log('console', 'start');
    //     console.time('start');
    //     machine.sCenterCenter.state = !machine.sCenterCenter.state;
    //     console.timeEnd('start');
    //     Log.log('console', 'end');
    //     Events.resetAll();
    //     Timer.reset();
    //     resetSwitchMatrix();
    //     resetMachine();
    //     }
    //     setTimeout(() => process.exit(0), 500);
    // }, 200, '');
});
}
