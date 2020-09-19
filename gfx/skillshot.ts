import { Group, Text } from 'aminogfx-gl';
import { Skillshot } from '../modes/skillshot';
import { gfx, makeText, Screen, alert } from '../gfx';
import { wrap } from '../util';
import { onChange } from '../state';
import { TreeEndEvent } from '../tree';
import { GameGfx } from './game';
import { machine } from '../machine';
import { time, Timer, onTick } from '../timer';

export class SkillShotGfx extends Group {
    award!: Text;
    instr!: Text;
    constructor(
        public ss: Skillshot,
    ) {
        super(gfx);
        this.z(ss.gPriority);
        this.w(Screen.w*.6);
        this.h(GameGfx.main);
        this.x(-(this.w()-Screen.w/2));
        this.y(-this.h()/2+GameGfx.top/2);
        this.add(gfx.createRect().w(this.w()).h(this.h()).fill('#444444').z(-.1));

        this.add(makeText('skillshot ready', 50, 'center', 'middle').x(this.w()/2).y(this.h()*.1));
        this.add(makeText(ss.awards[6]?.award ?? '', 35, 'center', 'middle').x(this.w()/2).y(this.h()*.3));
        this.add(this.instr = makeText('', 30, 'center', 'middle').x(this.w()/2).y(this.h()*.5));
        this.add(this.award = makeText('', 43));
        this.award.x(this.w()/2);
        this.award.y(this.h()*.6);
        this.add(makeText('flippers change target', 30, 'center', 'middle').x(this.w()/2).y(this.h()*.9));

        ss.watch(() => {
            this.award.text(ss.awards[ss.curAward].award);
            this.instr.text(`plunge to ${ss.awards[ss.curAward].switch} for:`);
        });

        ss.watch(() => this.visible(!machine.sRightFlipper._state || time() - machine.sRightFlipper.lastChange <= 300));
    }
}