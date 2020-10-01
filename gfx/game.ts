import { Group, Text } from 'aminogfx-gl';
import { Game } from '../game';
import { gfx, makeText, ModeGroup, Screen } from '../gfx';
import { onChange } from '../state';
import { comma } from '../util';

export class GameGfx extends ModeGroup {
    static readonly top = 70;
    static readonly main = Screen.h - GameGfx.top;

    ball = makeText('FREE PLAY', 40, 'right', 'top');
    constructor(
        public game: Game,
    ) {
        super(game);
        const group = gfx.createGroup();
        group.z(game.gPriority);
        group.add(gfx.createRect().fill('#999999').h(GameGfx.top).w(Screen.w).x(-Screen.w/2).y(-Screen.h/2).z(-.1));

        group.add(this.ball.x(Screen.w/2).y(-Screen.h/2));
        game.watch(() => this.ball.text('BALL '+game.ballNum.toFixed(0)));
        this.add(group);
    }
}