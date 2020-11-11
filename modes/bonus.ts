import { Node, Text } from 'aminogfx-gl';
import { Event, Events } from '../events';
import { addToScreen, alert, gfx, gWait, makeText, ModeGroup, Screen } from '../gfx';
import { GameGfx } from '../gfx/game';
import { Mode, Modes } from '../mode';
import { Outputs } from '../outputs';
import { fork } from '../promises';
import { State } from '../state';
import { comma, round, score, short } from '../util';
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
            rampUp: false,
            shooterDiverter: false,
            leftGate: false,
            rightGate: false,
        });

        fork(this.run());

        addToScreen(() => new BonusGfx(this));
    }

    async run() {
        if (!this.ball.tilted) 
        // await gWait(500, 'bonus start');
        await this.addLine('Drops', 5000, this.ball.drops);
        await this.addLine('Banks', 10000, this.ball.banks);
        await this.addLine('Spins', 100, this.ball.spins);
        await this.addLine('Lanes', 2500, this.ball.lanes);
        await this.addLine('Ramps', 15000, this.ball.ramps);
        // await this.addLine('Targets', 2500, this.ball.targets);
        if (this.ball.bonusX>1) {
            // if (!this.ball.tilted) 
                await gWait(500, 'bonus x');
            this.lines.push([`BONUS X: ${1}`]);
            const singleBonus = this.total;
            let x = 1;
            while (x < this.ball.bonusX) {
                if (!this.ball.tilted) await gWait(750, 'bonus x');
                x++;
                this.total = singleBonus * x;
                this.lines.pop();
                this.lines.push([`BONUS X: ${x}`]);
            }
            // if (!this.ball.tilted) 
                await gWait(1000, 'bonus x');
        }
        const initialTotal = this.total;
        if (!this.ball.tilted) {
            this.lines.push([`Total: ${score(this.total)}`]);

            this.ball.player.recordScore(this.total, 'bonus');
            const start = new Date().getTime();
            const speed = 25;
            const maxTime = 4000;
            const rate = Math.max(500, round(Math.abs(this.total)/(maxTime/speed), 1000));
            console.log('bonus raw rate', Math.abs(this.total)/(maxTime/speed));
            while (this.total > 0) {
                const change = Math.min(this.total, rate);
                this.total -= change;
                this.ball.player.addScore(change, null);
                await gWait(speed, 'bonus count');
            }
            console.log('bonus time %i for %i', new Date().getTime()-start, initialTotal);
        }
        // alert(`bonus took ${new Date().getTime()-start}`);
        // await gWait(1000, 'bonus end');
        this.total = initialTotal;
        await gWait(2000, 'bonus end');
        // if (this.ball.tilted) 
        this.end();
    }

    async addLine(left: string, value: number, count: number, wait = 750) {
        if (!count) return;
        const total = value * count;
        this.lines.push([left+`: ${comma(count, 3)}`, `* ${short(value)} = ${short(total, 4)}`]);
        this.total += total;
        // if (!this.ball.tilted)
            await gWait(wait, 'bonus');
    }

    end() {
        this.ball.bonus = undefined;
        Events.fire(new BonusEnd(this));
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
        bonus.watch(() => bonusText.text(`BONUS${bonus.ball.tilted?' lost':''}: ${comma(bonus.total, 5)}`));
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

export class BonusEnd extends Event {
    constructor(
        public bonus: Bonus,
    ) {
        super();
    }
}