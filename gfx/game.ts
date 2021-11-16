import { Group, Text } from 'aminogfx-gl';
import { Game } from '../game';
import { gfx, makeText, ModeGroup, Screen } from '../gfx';
import { machine } from '../machine';
import { onChange } from '../state';
import { comma, score } from '../util';

export class GameGfx extends ModeGroup {
    static readonly top = 70;
    static readonly main = Screen.h - GameGfx.top;

    ball = makeText('FREE PLAY', 40, 'right', 'top');
    player1 = makeText('PLAYER 1', 60, 'center', 'top').x(-Screen.w/6).y(-Screen.h/2);
    player2 = makeText('PLAYER 2', 60, 'center', 'top').x(Screen.w/6).y(-Screen.h/2);
    constructor(
        public game: Game,
    ) {
        super(game);
        const group = gfx.createGroup();
        group.z(game.gPriority);
        group.add(gfx.createRect().fill('#666666').h(GameGfx.top).w(Screen.w).x(-Screen.w/2).y(-Screen.h/2).z(-.1));

        group.add(this.ball.x(Screen.w/2).y(-Screen.h/2));
        game.watch(() => this.ball.text('BALL '+game.ballNum.toFixed(0)));
        this.add(group);

        group.add(this.player1, this.player2);
        game.watch(() => {
            if (game.players.length !== 2) {
                this.player1.visible(false);
                this.player2.visible(false);
                return;
            }
            this.player1.visible(true);
            this.player2.visible(true);
            this.player1.text(score(game.players[0].score));
            this.player2.text(score(game.players[1].score));
            this.player1.fontSize(game.playerUp===0? 60 : 40);
            this.player2.fontSize(game.playerUp===1? 60 : 40);
        });

        // const balls = makeText('', 40, 'left', 'middle').wrap('word').x(-Screen.w/2).y(0).w(Screen.w/2);
        // group.add(balls);
        // game.watch(() => balls.text(`T: ${machine.ballsInTrough}\nL: ${machine.ballsLocked}\nP: ${machine.ballsInPlay}`));
    }
}