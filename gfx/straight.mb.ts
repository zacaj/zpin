import { Group, Text } from 'aminogfx-gl';
import { Skillshot } from '../modes/skillshot';
import { gfx, makeText, Screen, alert, ModeGroup } from '../gfx';
import { wrap, comma, score } from '../util';
import { onChange } from '../state';
import { TreeEndEvent } from '../tree';
import { GameGfx } from './game';
import { StraightMb } from '../modes/straight.mb';
import { PokerHand } from './poker';

// eslint-disable-next-line no-undef
export class StraightMbGfx extends ModeGroup {
    notInstructions = gfx.createGroup();
    lightJp = makeText('COMPLETE LIT BANK TO LIGHT JACKPOT', 40, 'center', 'bottom').y(Screen.h*.15);
    getJp = makeText('SHOOT RAMP FOR JACKPOT', 65, 'center', 'bottom').y(Screen.h*-.05);
    value = makeText('100000', 50, 'center', 'bottom').y(Screen.h*.1);
    double = makeText('SHOOTER LANE COMBO: ONE SHOT 2X JACKPOT', 30, 'center', 'bottom').y(Screen.h*.45);
    or = makeText('- or -', 20, 'center', 'bottom').y(Screen.h*.375);
    spinner = makeText('SPINNER: +25% JACKPOT VALUE', 30, 'center', 'bottom').y(Screen.h*.31);

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
        this.add(this.notInstructions);

        this.notInstructions.add(makeText('STRAIGHT multiball!', 60).y(Screen.h*-.28).rz.anim({
            from: -5,
            to: 5,
            autoreverse: true,
            duration: 1500,
            loop: -1,
        }).start());

        this.add(this.lightJp);
        this.notInstructions.add(this.getJp);
        this.notInstructions.add(this.double);
        this.notInstructions.add(this.or);
        this.notInstructions.add(this.spinner);
        mb.watch(() => {
            this.lightJp.visible(mb.state._ !== 'jackpotLit');
            this.getJp.visible(mb.state._ === 'jackpotLit');
            this.double.visible(mb.state._ === 'jackpotLit' && !mb.state.doubled);
            this.or.visible(mb.state._ === 'jackpotLit' && !mb.state.doubled);
            this.spinner.visible(mb.state._ === 'jackpotLit' && !mb.state.doubled);
        });

        this.notInstructions.add(this.value);
        mb.watch(() => this.value.text(`JACKPOT: ${score(mb.value)}`));
    }
}