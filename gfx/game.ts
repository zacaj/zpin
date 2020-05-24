import { Group, Text } from 'aminogfx-gl';
import { Game } from '../game';
import { gfx, makeText, Screen } from '../gfx';
import { onChange } from '../state';

export class GameGfx extends Group {
    static top = 70;
    static main = Screen.h - GameGfx.top;

    score = makeText('00', 60, 'center', 'top');
    ball = makeText('FREE PLAY', 40, 'right', 'top');
    constructor(
        public game: Game,
    ) {
        super(gfx);
        const group = gfx.createGroup();
        group.z(100);
        group.add(gfx.createRect().fill('#999999').h(GameGfx.top).w(Screen.w).x(-Screen.w/2).y(-Screen.h/2).z(-1));

        group.add(this.score.y(-Screen.h/2));
        game.listen(onChange(game.players[0], 'score'), (e) => this.score.text(e.value!.toFixed(0)));

        group.add(this.ball.x(Screen.w/2).y(-Screen.h/2));
        game.listen(onChange(game, 'ballNum'), (e) => this.ball.text('BALL '+e.value!.toFixed(0)));
        this.add(group);

    }
}