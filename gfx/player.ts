import { Group, ImageView } from 'aminogfx-gl';
import { Poker, Card, getFileForCard } from '../modes/poker';
import { gfx, makeImage, Screen, Image, makeText } from '../gfx';
import { onChange } from '../state';
import { tryNum } from '../util';
import { machine } from '../machine';
import { onAny } from '../events';
import { Player } from '../modes/player';

export class PlayerGfx extends Group {
    instr = makeText('START HAND IN SHOOTER LANE', 40, 'center', 'bottom');
    constructor(
        public player: Player,
    ) {
        super(gfx);
        this.z(player.gPriority);

        this.add(this.instr.y(Screen.h*.49));
        player.watch(onChange(player, ['poker']), () => this.instr.visible(!player.curMode));
    }
}