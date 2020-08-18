import { Group, Text } from 'aminogfx-gl';
import { Game } from '../game';
import { gfx, makeText, Screen } from '../gfx';
import { onChange } from '../state';

export class GameGfx extends Group {
    static readonly top = 70;
    static readonly main = Screen.h - GameGfx.top;

    score = makeText('00', 60, 'center', 'top');
    ball = makeText('FREE PLAY', 40, 'right', 'top');
    constructor(
        public game: Game,
    ) {
        super(gfx);
        const group = gfx.createGroup();
        group.z(game.gPriority);
        group.add(gfx.createRect().fill('#999999').h(GameGfx.top).w(Screen.w).x(-Screen.w/2).y(-Screen.h/2).z(-.1));

        group.add(this.score.y(-Screen.h/2));
        game.watch(onChange(game.players[0], 'score'), () => this.score.text(game.players[0].score.toFixed(0)));

        group.add(this.ball.x(Screen.w/2).y(-Screen.h/2));
        game.watch(onChange(game, 'ballNum'), () => this.ball.text('BALL '+game.ballNum.toFixed(0)));
        this.add(group);

    }
}