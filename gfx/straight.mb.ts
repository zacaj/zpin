import { Group, Text } from 'aminogfx-gl';
import { Skillshot } from '../modes/skillshot';
import { gfx, makeText, Screen, alert } from '../gfx';
import { wrap } from '../util';
import { onChange } from '../state';
import { TreeEndEvent } from '../tree';
import { GameGfx } from './game';
import { StraightMb } from '../modes/straight.mb';

export class StraightMbGfx extends Group {
    constructor(
        public mb: StraightMb,
    ) {
        super(gfx);
        this.z(mb.priority);
        this.w(Screen.w*.6);
        this.h(GameGfx.main);
        this.x(-(this.w()-Screen.w/2));
        this.y(-this.h()/2+GameGfx.top/2);
        this.add(gfx.createRect().w(this.w()).h(this.h()).fill('#444444').z(-1));

        this.add(makeText('STraight multiball', 60));
    }
}