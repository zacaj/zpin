import { Group, Text } from 'aminogfx-gl';
import { Skillshot } from '../modes/skillshot';
import { gfx, makeText, Screen, alert } from '../gfx';
import { wrap, comma } from '../util';
import { onChange } from '../state';
import { TreeEndEvent } from '../tree';
import { GameGfx } from './game';
import { StraightMb } from '../modes/straight.mb';

export class StraightMbGfx extends Group {
    lightJp = makeText('COMPLETE LIT BANK TO LIGHT JACKPOT', 40, 'center', 'bottom').y(Screen.h*.15);
    getJp = makeText('SHOOT RAMP FOR JACKPOT', 60, 'center', 'bottom').y(Screen.h*.15);
    value = makeText('100000', 35, 'center', 'bottom').y(Screen.h*.4);

    constructor(
        public mb: StraightMb,
    ) {
        super(gfx);
        this.z(mb.gPriority);

        this.add(makeText('Straight multiball', 60).y(Screen.h*-.2).rz.anim({
            from: -5,
            to: 5,
            autoreverse: true,
            duration: 1500,
            loop: -1,
        }).start());

        this.add(this.lightJp);
        this.add(this.getJp);
        mb.watch(onChange(mb, ['curBank', 'awardingJp']), () => {
            this.lightJp.visible(!!mb.curBank && !mb.awardingJp);
            this.getJp.visible(!mb.curBank);
        });

        this.add(this.value);
        mb.watch(onChange(mb, 'value'), () => this.value.text(`JACKPOT VALUE: ${comma(mb.value)}`));
    }
}