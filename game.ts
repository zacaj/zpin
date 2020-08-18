import { SwitchEvent, onSwitchClose, onAnySwitchClose, resetSwitchMatrix, onAnyPfSwitchExcept } from './switch-matrix';
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

    closeShooter = false;

    players = [new Player(this)];
    playerUp = 0;
    get curPlayer(): Player {
        return this.players[this.playerUp];
    }
    ballNum = 1;
    rightGate = true;
    
    private constructor() {
        super(Modes.Game);
        // assert(machine.sTroughFull.state);
        State.declare<Game>(this, ['closeShooter', 'ballNum']);

        this.out = new Outputs(this, {
            kickerEnable: true,
            rightGate: () => this.rightGate,
            magnetPost: () => machine.sShooterUpper.wasClosedWithin(500) && !machine.sShooterLower.wasClosedWithin(750),
            upperMagnet: () => machine.sShooterUpper.wasClosedWithin(5000) && !machine.sShooterLower.wasClosedWithin(750) && !machine.sSpinner.wasClosedWithin(750),
        });

        this.gfx?.add(new GameGfx(this));


        this.listen([onAnySwitchClose(machine.sShooterMagnet, machine.sShooterUpper)], () => this.closeShooter = true);
        this.listen(onAnyPfSwitchExcept(machine.sShooterUpper, machine.sShooterMagnet, machine.sShooterLower), () => this.closeShooter = false);


        

        this.listen(onSwitchClose(machine.sLeftInlane),
            () => this.addChild(new KnockTarget()));


        this.addChild(new ClearHoles(), -1);
        this.addChild(new GameOverrides(this));

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

class GameOverrides extends Mode<MachineOutputs> {
    constructor(public game: Game) {
        super(Modes.GameOverrides);
        this.out = new Outputs(this, {
            shooterDiverter: () => game.closeShooter? false : undefined,
        });
    }
}