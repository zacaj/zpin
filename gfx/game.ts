import { Group, Text } from "aminogfx-gl";
import { Game } from "../game";
import { gfx, makeText, Screen } from "../gfx";
import { onChange } from "../state";

export class GameGfx extends Group {
    score = makeText('00', 60, 'center', 'top');
    ball = makeText('FREE PLAY', 40, 'right', 'top');
    constructor(
        public game: Game,
    ) {
        super(gfx);
        this.z(-1000);

        this.add(this.score.y(-Screen.h/2));
        game.listen(onChange(game.players[0], 'score'), (e) => this.score.text(e.value!.toFixed(0)));

        this.add(this.ball.x(Screen.w/2).y(-Screen.h/2));
        game.listen(onChange(game, 'ballNum'), (e) => this.ball.text('BALL '+e.value!.toFixed(0)));
    }
}