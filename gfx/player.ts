import { Group, ImageView } from 'aminogfx-gl';
import { Poker, Card, getFileForCard } from '../modes/poker';
import { gfx, makeImage, Screen, Image, makeText } from '../gfx';
import { onChange } from '../state';
import { tryNum, comma } from '../util';
import { machine } from '../machine';
import { onAny } from '../events';
import { Player } from '../modes/player';

export class PlayerGfx extends Group {
    instr = makeText('START HAND IN SHOOTER LANE', 40, 'center', 'bottom');
    score = makeText('00', 60, 'center', 'top').y(-Screen.h/2);
    bank = makeText('00', 30, 'left', 'top').x(-Screen.w/2).y(-Screen.h/2);
    constructor(
        public player: Player,
    ) {
        super(gfx);
        this.z(player.gPriority);

        this.add(this.instr.y(Screen.h*.49));
        player.watch(() => this.instr.visible(!player.curMode));

        this.add(this.score);
        player.watch(() => this.score.text(comma(player.score)));

        this.add(this.bank);
        player.watch(() => this.score.text(comma(player.score)));

        player.watch(() => this.bank.text('Bank: '+comma(player.store.Poker?.bank ?? 0)));
    }
}