import { Group, Text } from 'aminogfx-gl';
import { Game } from '../game';
import { gfx, makeText, ModeGroup, Screen } from '../gfx';
import { machine } from '../machine';
import { onChange } from '../state';
import { comma, score, seq } from '../util';

export class GameGfx extends ModeGroup {
    static readonly top = 70;
    static readonly main = Screen.h - GameGfx.top;

    ball = makeText('FREE PLAY', 40, 'right', 'top');
    players = seq(4).map(n => makeText('PLAYER 1', 60, 'center', 'top').x(-Screen.w/6).y(-Screen.h/2));
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

        group.add(...this.players);
        game.watch(() => {
            for (const player of this.players) {
                const i = this.players.indexOf(player);
                if (game.players.length > 4 || i >= game.players.length) {
                    player.visible(false);
                    continue;
                }

                player.visible(true);
                player.text(score(game.players[i].score));
                player.fontSize((game.playerUp===i? 60 : 40) - (game.players.length<4? 0 : 7));
                const spacing = game.players.length===2? Screen.w/3 : game.players.length===3? Screen.w / 4 : Screen.w/5.75;
                player.x(-spacing*(game.players.length-1)/2 + spacing * i);
            }
        });

        // const balls = makeText('', 40, 'left', 'middle').wrap('word').x(-Screen.w/2).y(0).w(Screen.w/2);
        // group.add(balls);
        // game.watch(() => balls.text(`T: ${machine.ballsInTrough}\nL: ${machine.ballsLocked}\nP: ${machine.ballsInPlay}`));
    }
}