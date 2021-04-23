import { AnimParams, Rect } from 'aminogfx-gl';
import { gfx, makeText, ModeGroup, Screen } from '../gfx';
import { Color, colorToHex } from '../light';
import { FullHouseMb, Jackpot } from '../modes/full-house.mb';
import { score } from '../util';
import { PokerHand } from './poker';

// eslint-disable-next-line no-undef
export class FullHouseMbGfx extends ModeGroup {
    notInstructions = gfx.createGroup();
    light = makeText('RAMP OR EJECT LIGHTS JACKPOT', 40, 'center', 'bottom', gfx, Color.White).y(Screen.h*.1);
    jp = makeText('JACKPOT LIT', 40, 'center', 'bottom', gfx, () => this.mb.jpColor()).y(Screen.h*.1);
    red = makeText('TARGET LOWERS VALUE', 30, 'center', 'bottom', gfx).y(Screen.h*.18);
    magnet = makeText('SPINNER FEEDS UPPER FLIPPER', 30, 'center', 'bottom', gfx).y(Screen.h*.18);
    value = makeText('100000', 45, 'center', 'bottom').y(Screen.h*.35);

    hand!: PokerHand;

    constructor(
        public mb: FullHouseMb,
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

        this.notInstructions.add(makeText('full house multiball!', 60).y(Screen.h*-.28).x.anim(anim).start());

        this.add(this.light);
        this.add(this.jp);
        this.add(this.red);
        this.add(this.magnet);

        this.notInstructions.add(this.value);
        mb.watch(() => this.value.text(`VALUE: ${score(mb.value??0)}`).visible(mb.state._==='jackpotLit'));

        mb.watch(() => this.light.visible(mb.state._!=='jackpotLit'));
        mb.watch(() => {
            this.jp.visible(mb.state._==='jackpotLit');
            if (mb.state._==='jackpotLit') 
                (this.jp.children[1] as Rect).fill(colorToHex(this.mb.jpColor())!);
        });
        mb.watch(() => this.red.visible(mb.state._==='jackpotLit'&&mb.state.jp===Jackpot.RightLane));
        mb.watch(() => this.magnet.visible(mb.state._==='jackpotLit'&&mb.state.jp.startsWith('Left')));
    }
}