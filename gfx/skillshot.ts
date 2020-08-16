import { Group, Text } from 'aminogfx-gl';
import { Skillshot } from '../modes/skillshot';
import { gfx, makeText, Screen, alert } from '../gfx';
import { wrap } from '../util';
import { onChange } from '../state';
import { TreeEndEvent } from '../tree';
import { GameGfx } from './game';

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
        this.add(makeText('plunge to choose bet amount', 35, 'center', 'middle').x(this.w()/2).y(this.h()*.3));
        this.add(this.instr = makeText('', 30, 'center', 'middle').x(this.w()/2).y(this.h()*.5));
        this.add(this.award = makeText('', 43));
        this.award.x(this.w()/2);
        this.award.y(this.h()*.6);
        this.add(makeText('flippers change target', 30, 'center', 'middle').x(this.w()/2).y(this.h()*.9));

        ss.watch(onChange(ss, 'curAward'), () => {
            this.award.text(ss.awards[ss.curAward][1]);
            this.instr.text(`plunge to ${ss.awards[ss.curAward][0]} for:`);
        });
    }
}