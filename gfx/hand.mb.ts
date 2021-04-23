import { Anim, AnimParams, Group, Text } from 'aminogfx-gl';
import { Skillshot } from '../modes/skillshot';
import { gfx, makeText, Screen, alert, ModeGroup } from '../gfx';
import { wrap, comma, score } from '../util';
import { onChange } from '../state';
import { TreeEndEvent } from '../tree';
import { GameGfx } from './game';
import { StraightMb } from '../modes/straight.mb';
import { PokerHand } from './poker';
import { HandMb } from '../modes/hand.mb';

// eslint-disable-next-line no-undef
export class HandMbGfx extends ModeGroup {
    notInstructions = gfx.createGroup();
    drops = makeText('DROP TARGETS BUILD VALUE', 40, 'center', 'bottom').y(Screen.h*.00);
    banks = makeText('COMPLETE BANKS TO BUILD FASTER', 40, 'center', 'bottom').y(Screen.h*.1);
    red = makeText('RED TARGETS RESET VALUE', 30, 'center', 'bottom').y(Screen.h*.18);
    value = makeText('100000', 45, 'center', 'bottom').y(Screen.h*.35);
    spinner = makeText('100000', 45, 'center', 'bottom').y(Screen.h*.45);

    hand!: PokerHand;

    constructor(
        public mb: HandMb,
    ) {
        super(mb);
        this.z(mb.gPriority);
        const anim: AnimParams = {
            from: 2,
            to: -2,
            autoreverse: true,
            duration: 1500,
            loop: -1,
            timeFunc: 'cubicInOut',
        };
        this.add(this.notInstructions);

        this.notInstructions.add(makeText('HAND Multiball!', 60).y(Screen.h*-.28).sx.anim(anim).start().sy.anim(anim).start());

        this.add(this.drops);
        this.add(this.banks);
        this.add(this.red);

        this.notInstructions.add(this.value);
        mb.watch(() => this.value.text(`LEFT ORBIT: ${score(mb.value)}` + (mb.state._==='started'&&mb.state.doubled? ' *2' : '')));

        this.notInstructions.add(this.spinner);
        mb.watch(() => this.spinner.text(`SPINNER: ${score(mb.spinner)} PER SPIN`));
    }
}