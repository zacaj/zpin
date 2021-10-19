import { AnimParams, Rect } from 'aminogfx-gl';
import { gfx, makeText, ModeGroup, Screen } from '../gfx';
import { Color, colorToHex } from '../light';
import { FlushMb } from '../modes/flush.mb';
import { score } from '../util';
import { PokerHand } from './poker';

// eslint-disable-next-line no-undef
export class FlushMbGfx extends ModeGroup {
    notInstructions = gfx.createGroup();
    light = makeText('SHOOT BLUE SHOTS TO (RE)START HURRYUP', 40, 'center', 'bottom').y(Screen.h*-.0);
    collect = makeText('SHOOT SHOT AGAIN TO COLLECT', 40, 'center', 'bottom').y(Screen.h*.1);
    jp = makeText('JACKPOT LIT!', 50, 'center', 'bottom', gfx, Color.Yellow).y(Screen.h*-.1);
    value = makeText('100000', 120, 'center', 'bottom').y(Screen.h*.3).wrap('end').w(Screen.w).x(-Screen.w/2);

    hand!: PokerHand;

    constructor(
        public mb: FlushMb,
    ) {
        super(mb);
        this.z(mb.gPriority);
        const anim: AnimParams = {
            from: 100,
            to: -100,
            autoreverse: true,
            duration: 1000,
            loop: -1,
            timeFunc: 'linear',
        };
        this.add(this.notInstructions);

        this.notInstructions.add(makeText('FLUSH multiball!', 60).y(Screen.h*-.28).x.anim(anim).start());

        this.add(this.light);
        this.add(this.collect);
        this.add(this.jp);
        this.add(this.value);

        mb.watch(() => this.value.text(mb.state._==='jackpotLit'? score(mb.state.value) : [
            mb.shotMult>1? `${mb.shotMult}X SHOTS` : '',
            mb.targetMult>1? `${mb.targetMult}X TARGETS` : '',
            mb.standupMult>1? `${mb.standupMult}X STANDUPS` : '',
        ].truthy().join('\n')).fontSize(mb.state._==='jackpotLit'? 150 : 50));

        mb.watch(() => this.light.visible(mb.state._!=='jackpotLit'));
        mb.watch(() => this.collect.visible(mb.state._!=='jackpotLit'));
        mb.watch(() => {
            this.jp.visible(mb.state._==='jackpotLit');
        });
    }
}