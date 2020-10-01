import { Group, Text } from 'aminogfx-gl';
import { Skillshot } from '../modes/skillshot';
import { gfx, makeText, Screen, alert, ModeGroup } from '../gfx';
import { wrap, comma } from '../util';
import { onChange } from '../state';
import { TreeEndEvent } from '../tree';
import { GameGfx } from './game';
import { StraightMb } from '../modes/straight.mb';
import { PokerHand } from './poker';

// eslint-disable-next-line no-undef
export class StraightMbGfx extends ModeGroup {
    lightJp = makeText('COMPLETE LIT BANK TO LIGHT JACKPOT', 40, 'center', 'bottom').y(Screen.h*.15);
    getJp = makeText('SHOOT RAMP FOR JACKPOT', 60, 'center', 'bottom').y(Screen.h*.15);
    value = makeText('100000', 35, 'center', 'bottom').y(Screen.h*.4);

    hand!: PokerHand;

    constructor(
        public mb: StraightMb,
    ) {
        super(mb);
        this.z(mb.gPriority);

        this.hand = new PokerHand(mb, mb.hand, true);
        this.hand.sx(1).sy(1).z(-.2).y(Screen.h*-.1);
        this.hand.add(gfx.createRect().fill('#000000').opacity(0.5).z(.1).w(PokerHand.w*7).h(PokerHand.h));
        this.add(this.hand);

        this.add(makeText('multiball!', 60).y(Screen.h*-.28).rz.anim({
            from: -5,
            to: 5,
            autoreverse: true,
            duration: 1500,
            loop: -1,
        }).start());

        this.add(this.lightJp);
        this.add(this.getJp);
        mb.watch(() => {
            this.lightJp.visible(mb.state._ !== 'jackpotLit');
            this.getJp.visible(mb.state._ === 'jackpotLit');
        });

        this.add(this.value);
        mb.watch(() => this.value.text(`JACKPOT VALUE: ${comma(mb.value)}`));
    }
}