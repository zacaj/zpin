import fs from 'fs';
import { argv } from 'yargs';
import { AttractMode } from './attract';
import { Events } from './events';
import { addToScreen, alert, gfx, screen } from './gfx';
import { GameGfx } from './gfx/game';
import { checkForScores } from './highscore';
import { initMachine } from './init';
import { Log } from './log';
import { machine } from './machine';
import { Mode, Modes } from './mode';
import { Player } from './modes/player';
import { MPU } from './mpu';
import { Outputs } from './outputs';
import { playSound } from './sound';
import { State } from './state';
import { onClose, onSwitchClose, onSwitchOpen, Switch } from './switch-matrix';
import { time, Timer } from './timer';
import { TreeChangeEvent } from './tree';
import { assert, getFormattedTime } from './util';
import { ClearHoles } from './util-modes';

export class Game extends Mode {
    get nodes() {
        return [this.curPlayer, ...this.tempNodes].truthy();
    }

    players: Player[] = [];
    playerUp = 0;
    get curPlayer(): Player {
        return this.players[this.playerUp];
    }
    ballNum = 1;
    ballCount = 3;

    get ball() {
        return this.curPlayer.ball;
    }

    startTimestamp = getFormattedTime();

    totals: {[source: string]: {times: number; total: number; average: number}} = {};
    
    private constructor(
        public seed: string,
    ) {
        super(Modes.Game);
        Log.log(['console', 'game'], "start game with seed ", seed);
        // assert(machine.sTroughFull.state);
        State.declare<Game>(this, ['ballNum', 'playerUp', 'players']);

        this.out = new Outputs(this, {
            kickerEnable: true,
            // magnetPost: () => (machine.sShooterUpper.wasClosedWithin(1000) || 
            //         (machine.sLeftOrbit.wasClosedWithin(2000) && !machine.sShooterUpper.wasClosedWithin(1000) && machine.cRightGate.actual))
            //         && !machine.sShooterLower.wasClosedWithin(750),
            // upperMagnet: () => machine.sShooterUpper.wasClosedWithin(3000) && !machine.sShooterLower.wasClosedWithin(750) && !machine.sSpinner.wasClosedWithin(750),
        });

        this.listen(onSwitchClose(machine.sStartButton), e => Timer.callIn(() => {
            if (machine.sStartButton.state && machine.sStartButton.lastClosed === e.when) {
                Log.log(['game', 'console'], 'game force-ended');
                this.end();
            }
        }, 2000, 'start button hold'));
        this.listen([...onSwitchOpen(machine.sStartButton), () => time()-machine.sStartButton.lastClosed! < 500 && machine.sStartButton.lastClosed! > this.startTime], 'addPlayer');
        

        // this.listen(onSwitchClose(machine.sLeftInlane),
        //     () => this.addTemp(new KnockTarget()));

        this.listen(onClose(), (e) => this.curPlayer.addScore(this.scores.get(e.sw) ?? 0, e.sw.name));

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
                // alert('GAME OVER', 5000);
                await checkForScores(this);
                const totals = Object.keys(this.totals).map(source => ({
                    ...this.totals[source],
                    source,
                }));
                totals.sort((a, b) => b.total - a.total);

                fs.writeFileSync(`./scores/game-${this.startTimestamp}.json`, JSON.stringify({
                    players: this.players.map(p => ({ number: p.number, score: p.score })),
                    totals,
                }, undefined, 2));
                if (require.main === module) {
                    debugger;
                    process.exit(0);
                }
                else 
                    this.end();
            }
        }
        if (!this.ended) {
            Log.log('console', 'player %i starting ball %i', this.curPlayer.number, this.ballNum);
            Events.fire(new TreeChangeEvent(this));
            await this.curPlayer.startBall();
        }
    }

    end() {
        machine.attract = new AttractMode(this.players.map(p => [p.score, p.store.Poker!.bank]));
        machine.attract.started();
        machine.game = undefined;
        return super.end();
    }

    static async start(seed: string = argv.seed as string ?? 'pinball'): Promise<Game> {
        assert(!machine.game);
        if (gfx && !MPU.isLive) {
            machine.sTroughFull.changeState(true, 'fake');
        }
        if (!machine.sTroughFull.state) {
            const pop = alert('BALL MISSING', 0)[0];
            const clear = new ClearHoles();
            machine.addTemp(clear);
            await new Promise(resolve => Events.listen(() => {
                resolve();
                return 'remove';
            }, onSwitchClose(machine.sTroughFull)));
            pop.parent?.remove(pop);
            clear.end();
        }
        machine.attract?.end();
        const game = new Game(seed);
        machine.game = game;
        game.started();
        game.players.push(new Player(game, 1, game.seed));
        game.curPlayer.started();
        await game.curPlayer.startBall();
        return game;
    }

    addPlayer() {
        if (!machine.sShooterLane.state || this.ballNum > 1 || this.curPlayer.score>0) return;
        this.players.push(new Player(this, this.players.length+1, this.seed));
        alert(`PLAYER ${this.players.length} ADDED`);
        if (this.players.length <= 4) void playSound(`player ${this.players.length}`);
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
        [machine.sCenterLeft,       6000],
        [machine.sCenterCenter,     6000],
        [machine.sCenterRight,      6000],
        [machine.sLeft1,            4000],
        [machine.sLeft2,            4000],
        [machine.sLeft3,            4000],
        [machine.sLeft4,            4000],
        [machine.sRight1,           4000],
        [machine.sRight2,           4000],
        [machine.sRight3,           4000],
        [machine.sRight4,           4000],
        [machine.sRight5,           4000],
        [machine.sLeftBack1,        5000],
        [machine.sLeftBack2,        5000],
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
    void initMachine(true, true, true, false);
}
