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
import { screen } from './gfx';
import { Player } from './modes/player';
import { assert } from './util';
import { Ball } from './modes/ball';
import { StraightMb } from './modes/straight.mb';
import { fork } from './promises';
import { Tree } from './tree';

export class Game extends Mode<MachineOutputs> {


    players = [new Player(this)];
    playerUp = 0;
    get curPlayer(): Player {
        return this.players[this.playerUp];
    }
    ballNum = 1;
    
    private constructor() {
        super(Modes.Game);
        // assert(machine.sTroughFull.state);
        State.declare<Game>(this, ['ballNum']);

        this.out = new Outputs(this, {
            kickerEnable: true,
            magnetPost: () => machine.sShooterUpper.wasClosedWithin(500) && !machine.sShooterLower.wasClosedWithin(750),
            upperMagnet: () => machine.sShooterUpper.wasClosedWithin(5000) && !machine.sShooterLower.wasClosedWithin(750) && !machine.sSpinner.wasClosedWithin(750),
        });

        this.gfx?.add(new GameGfx(this));

        

        // this.listen(onSwitchClose(machine.sLeftInlane),
        //     () => this.addChild(new KnockTarget()));

        this.listen(onClose(), (e) => this.curPlayer.score += this.scores.get(e.sw) ?? 0);


        this.playerUp = 0;
        this.ballNum = 1;
        this.addChild(this.curPlayer);
        this.curPlayer.startBall();
    }

    onBallEnd() {
        const lastPlayer = this.curPlayer;
        this.removeChild(lastPlayer);
        this.playerUp++;
        if (this.playerUp >= this.players.length) {
            this.playerUp = 0;
            this.ballNum++;
            // if (this.ballNum > 3) {
            //     if (require.main === module) {
            //         debugger;
            //         process.exit(0);
            //     }
            //     else
            //         this.end();
            // }
        }
        this.addChild(this.curPlayer);
        this.curPlayer.startBall();
    }

    static start(): Game {
        const game = new Game();
        machine.addChild(game);
        screen?.add(game.gfx!);
        return game;
    }

    scores = new Map<Switch, number>([
        [machine.sLeftInlane,       1000],
        [machine.sLeftOutlane,      10000],
        [machine.sRightInlane,      1000],
        [machine.sRightOutlane,     10000],
        [machine.sMiniEntry,        0],
        [machine.sMiniOut,          0],
        [machine.sMiniMissed,       0],
        [machine.sOuthole,          0],
        [machine.sTroughFull,       0],
        [machine.sLeftSling,        10],
        [machine.sRightSling,       100],
        [machine.sMiniLeft,         25000],
        [machine.sMiniCenter,       25000],
        [machine.sMiniRight,        25000],
        [machine.sCenterLeft,       5000],
        [machine.sCenterCenter,     5000],
        [machine.sCenterRight,      5000],
        [machine.sLeft1,            3000],
        [machine.sLeft2,            3000],
        [machine.sLeft3,            3000],
        [machine.sLeft4,            3000],
        [machine.sRight1,           3000],
        [machine.sRight2,           3000],
        [machine.sRight3,           3000],
        [machine.sRight4,           3000],
        [machine.sRight5,           3000],
        [machine.sLeftBack1,        25000],
        [machine.sLeftBack2,        25000],
        [machine.sCenterBackLeft,   1000],
        [machine.sCenterBackCenter, 1000],
        [machine.sCenterBackRight,  1000],
        [machine.sUpper3Left,       8000],
        [machine.sUpper3Center,     8000],
        [machine.sUpper3Right,      8000],
        [machine.sUpper2Left,       8000],
        [machine.sUpper2Right,      8000],
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
        [machine.sShooterLane,      10],
        [machine.sShooterLower,     10],
        [machine.sBackLane,         1000],
        [machine.sPop,              7500],
        [machine.sUpperInlane,      1000],
        [machine.sUnderUpperFlipper,25000],
        [machine.sUpperSideTarget,  15000],
        [machine.sUpperEject,       1000],
        [machine.sUpperLaneLeft,    1000],
        [machine.sUpperLaneRight,   1000],
        [machine.sLowerLaneLeft,    1000],
        [machine.sLowerLaneRight,   1000],
        [machine.sLowerLaneCenter,  1000],
        [machine.sRampMade,         5000],
    ]);
}

export class LockLit extends Mode<Pick<MachineOutputs, 'rampUp'>> {
    rampUp = false;

    constructor() {
        super(Modes.LockLit);

        this.out = new Outputs(this, {
            rampUp: () => this.rampUp,
        });
    }
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
