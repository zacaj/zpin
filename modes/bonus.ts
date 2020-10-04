import { Node, Text } from 'aminogfx-gl';
import { addToScreen, gfx, gWait, makeText, ModeGroup, Screen } from '../gfx';
import { GameGfx } from '../gfx/game';
import { Mode, Modes } from '../mode';
import { Outputs } from '../outputs';
import { fork } from '../promises';
import { State } from '../state';
import { comma, short } from '../util';
import { Ball } from './ball';

export class Bonus extends Mode {
    lines: [string, string?][] = [];
    total = 0;

    constructor(
        public ball: Ball,
    ) {
        super(Modes.Bonus);
        State.declare<Bonus>(this, ['lines', 'total']);
        this.out = new Outputs(this, {
            kickerEnable: false,
            outhole: false,
            troughRelease: false,
        });

        fork(this.run());

        addToScreen(() => new BonusGfx(this));
    }

    async run() {
        await gWait(500, 'bonus start');
        await this.addLine('Drops', 2500, this.ball.drops);
        await this.addLine('Banks', 10000, this.ball.banks);
        await this.addLine('Spins', 100, this.ball.spins);
        await this.addLine('Lanes', 1000, this.ball.lanes);
        await this.addLine('Ramps', 10000, this.ball.ramps);
        // await this.addLine('Targets', 2500, this.ball.targets);
        if (this.ball.bonusX>1) {
            await gWait(500, 'bonus x');
            this.lines.push([`BONUS X: ${1}`]);
            const singleBonus = this.total;
            let x = 1;
            while (x < this.ball.bonusX) {
                await gWait(750, 'bonus x');
                x++;
                this.total = singleBonus * x;
                this.lines.pop();
                this.lines.push([`BONUS X: ${x}`]);
            }
            await gWait(1000, 'bonus x');
        }
        while (this.total > 0) {
            const change = Math.min(this.total, 1000);
            this.total -= change;
            this.ball.player.score += change;
            await gWait(10, 'bonus count');
        }
        await gWait(1500, 'bonus end');
        this.end();
    }

    async addLine(left: string, value: number, count: number, wait = 750) {
        if (!count) return;
        const total = value * count;
        this.lines.push([left+`: ${comma(count, 3)}`, `* ${short(value)} = ${short(total, 4)}`]);
        this.total += total;
        await gWait(wait, 'bonus');
    }

    end() {
        this.ball.bonus = undefined;
        return super.end();
    }
}

export class BonusGfx extends ModeGroup {
    constructor(
        public bonus: Bonus,
    ) {
        super(bonus);
        this.z(bonus.gPriority);
        const top = -Screen.h/2+GameGfx.top;

        // background
        const r = gfx.createRect().fill('#777777').z(-.1).w(Screen.w).h(GameGfx.main).y(top).x(-Screen.w/2);
        this.add(r);

        const bonusText = makeText('BONUS', 80, 'center', 'top').y(top);
        bonus.watch(() => bonusText.text(`BONUS: ${comma(bonus.total, 5)}`));
        this.add(bonusText);

        const lines = gfx.createGroup();
        this.add(lines);

        bonus.watch(() => {
            lines.clear();
            let y = top + bonusText.fontSize()*1.5;
            for (const [left, right] of bonus.lines) {
                let l: Text;
                if (right) {
                    l = makeText(left, 50, 'left', 'top').x(-Screen.w/2*.75).y(y);
                    const r = makeText(right, 50, 'right', 'top').x(Screen.w/2*.75).y(y);
                    lines.add(l, r);
                } else {
                    l = makeText(left, 50, 'center', 'top').y(y);
                    lines.add(l);
                }
                y += l.fontSize()*1.25;
            }
        });
    }
}