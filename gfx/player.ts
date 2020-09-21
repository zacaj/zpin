import { Group, ImageView } from 'aminogfx-gl';
import { Poker, Card, getFileForCard } from '../modes/poker';
import { gfx, makeImage, Screen, Image, makeText } from '../gfx';
import { onChange } from '../state';
import { tryNum, comma } from '../util';
import { machine } from '../machine';
import { onAny } from '../events';
import { Player } from '../modes/player';
import { GameGfx } from './game';

export class PlayerGfx extends Group {
    instr = makeText('START HAND IN SHOOTER LANE', 40, 'center', 'bottom');
    score = makeText('00', 60, 'center', 'top').y(-Screen.h/2);
    bank = makeText('00', 30, 'left', 'top').x(-Screen.w/2).y(-Screen.h/2);
    handsLeft = makeText('', 30, 'left', 'top').x(-Screen.w/2).y(-Screen.h/2+GameGfx.top);

    noMode!: Group;
    pokerOrNo!: Group;

    constructor(
        public player: Player,
    ) {
        super(gfx);
        this.z(player.gPriority);

        this.add(this.noMode = gfx.createGroup());
        player.watch(() => this.noMode.visible(!!player.noMode));
        this.add(this.pokerOrNo = gfx.createGroup());
        player.watch(() => this.pokerOrNo.visible(!!player.noMode || !!player.poker));

        this.noMode.add(this.instr.y(Screen.h*.49));
        player.watch(() => this.instr.visible(!player.curMode));
        player.watch(() => this.instr.text([
            machine.lShooterStartHand.lit()? 'START HAND IN SHOOTER LANE' : undefined,
            machine.lEjectStartMode.lit()? 'START MODE aT EJECT HOLE' : undefined,
            machine.lRampStartMb.lit()? 'START MULTIBALL aT RAMP' : undefined,
        ].filter(x => !!x).join('\n')));

        this.add(this.score);
        player.watch(() => this.score.text(comma(player.score)));

        this.pokerOrNo.add(this.bank);
        player.watch(() => this.bank.text('Bank: '+comma(player.store.Poker?.bank ?? 0)));

        this.pokerOrNo.add(this.handsLeft);
        player.watch(() => {
            const left = player.store.Poker?.handsForMb-player.store.Poker?.handsWon;
            this.handsLeft.text(`${left} win${left>1?'s':''} for MB`);
        });
    }
}