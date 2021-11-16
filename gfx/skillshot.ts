import { Group, Rect, Text } from 'aminogfx-gl';
import { Skillshot } from '../modes/skillshot';
import { gfx, makeText, Screen, alert, ModeGroup } from '../gfx';
import { wrap } from '../util';
import { onChange } from '../state';
import { TreeEndEvent } from '../tree';
import { GameGfx } from './game';
import { machine } from '../machine';
import { time, Timer, onTick } from '../timer';

const switches = [
    '1st switch:',
    '2nd switch:',
    '3rd switch:',
    'top lanes: ',
    'top eject: ',
    'left lane: ',
];

export class SkillShotGfx extends ModeGroup {
    // award!: Text;
    // instr!: Text;
    awards: Text[] = [];
    highlight!: Rect;
    arrow = makeText('>', 50, 'left', 'middle').z(.1);
    constructor(
        public ss: Skillshot,
    ) {
        super(ss);
        this.z(ss.gPriority);
        this.w(Screen.w*.6);
        this.h(GameGfx.main);
        this.x(-(this.w()-Screen.w/2));
        this.y(-this.h()/2+GameGfx.top/2);
        this.add(gfx.createRect().w(this.w()).h(this.h()).fill('#444444').z(-.1));

        // this.add(makeText(`player ${ss.player.number}`, 30, 'center', 'middle').x(this.w()/2).y(this.h()*.05));
        this.add(makeText('skillshot ready', 50, 'center', 'middle').x(this.w()/2).y(this.h()*.08));
        // this.add(makeText(ss.awards[6]?.award ?? '', 30, 'center', 'middle').x(this.w()/2).y(this.h()*.3));
        // this.add(this.instr = makeText('', 30, 'center', 'middle').x(this.w()/2).y(this.h()*.5));
        // this.add(this.award = makeText('', 43));
        // this.award.x(this.w()/2);
        // this.award.y(this.h()*.6);
        this.add(makeText('SELECT SKILLSHOT WITH FLIPPERS:', 36, 'center', 'middle').x(this.w()/2).y(this.h()*.2));

        // ss.watch(() => {
        //     this.award.text(ss.awards[ss.curAward].award);
        //     this.instr.text(`plunge to ${ss.awards[ss.curAward].switch} for:`);
        // });
        this.highlight = gfx.createRect().x(this.w()*.015 + this.w()*(1-.015*2)/2).w(this.w()*(1-.015*2)).h(52).originX(.5).originY(0.5).fill('#000000');
        this.highlight.sy.anim({
            from: 0.95,
            to: 1.03,
            autoreverse: true,
            duration: 500,
            loop: -1,
        }).start();
        this.add(this.highlight);

        this.add(this.arrow);
        this.arrow.x.anim({
            from: this.w()*.01,
            to: this.w()*.01+this.w()*.04,
            autoreverse: true,
            duration: 500,
            loop: -1,
        }).start();

        for (let i=0; i<6; i++) {
            const text = makeText('> XXXXX: award text here <', 35, 'left', 'bottom').x(this.w()*.03).y(this.h()*(.4+.1*i)).z(.1);
            this.add(text);
            this.awards.push(text);
        }

        ss.watch(() => {
            for (let i=0; i<6; i++) {
                this.awards[i].text((i===ss.curAward? '  ' : '  ')+`${switches[i]} ${ss.awards[i].award}`);
                // this.awards[i].fill(ss.curAward===i? '#000000' : '#FFFFFF');
            }
            this.highlight.y(this.h()*(.4+.1*ss.curAward) - 20 + 3);
            this.arrow.y(this.h()*(.4+.1*ss.curAward) - 20);
        });

        ss.watch(() => this.visible(!machine.sRightFlipper._state || time() - machine.sRightFlipper.lastChange <= 350));

        this.add(makeText('RIGHT FLIPPER: HIDE', 20, 'right', 'bottom').x(this.w()*.99).y(this.h()*.98));
    }
}