import { Text } from 'aminogfx-gl';
import { addToScreen, gfx, gWait, makeText, ModeGroup, Screen } from '../gfx';
import { GameGfx } from '../gfx/game';
import { Mode, Modes } from '../mode';
import { Outputs } from '../outputs';
import { fork } from '../promises';
import { State } from '../state';
import { comma, money, score } from '../util';
import { Player } from './player';
import { Poker } from './poker';

export class EndOfGameBonus extends Mode {
    total?: number;
    lines: [string, string?][] = [];

    constructor(
        public player: Player,
    ) {
        super(Modes.Bonus);
        State.declare<EndOfGameBonus>(this, ['total', 'lines']);
        this.out = new Outputs(this, {
            kickerEnable: false,
            outhole: false,
            troughRelease: false,
        });

        fork(this.run());

        addToScreen(() => new EogGfx(this));
    }

    async run() {
        if (this.player.poker)
            this.player.store.Poker!.bank += this.player.poker.pot / 2;
        await gWait(500, 'bonus start');
        await this.addLine('BANKROLL:', money(this.player.store.Poker!.bank));
        await this.addLine('BUY-IN:', money(Poker.BankStart));
        await this.addLine('PROFIT:', money(this.player.store.Poker!.bank - Poker.BankStart));
        await this.addLine('CASH VALUE:', comma(this.player.store.Poker!.cashValue));
        await gWait(500, 'bonus x');
        this.total = (this.player.store.Poker!.bank - Poker.BankStart) * this.player.store.Poker!.cashValue;
        await gWait(2000, 'bonus x');
        while (this.total !== 0) {
            const change = Math.min(Math.abs(this.total), 1000)*Math.sign(this.total);
            this.total -= change;
            this.player.score += change;
            await gWait(10, 'bonus count');
        }
        await gWait(2500, 'bonus end');
        this.end();
    }

    async addLine(left: string, right?: string, wait = 1000) {
        this.lines.push([left, right]);
        await gWait(wait, 'bonus');
    }
}

export class EogGfx extends ModeGroup {
    constructor(
        public bonus: EndOfGameBonus,
    ) {
        super(bonus);
        this.z(bonus.gPriority);
        const top = -Screen.h/2+GameGfx.top;

        // background
        const r = gfx.createRect().fill('#777777').z(-.1).w(Screen.w).h(GameGfx.main).y(top).x(-Screen.w/2);
        this.add(r);

        const bonusText = makeText('END OF GAME CASH-OUT', 80, 'center', 'top').y(top);
        this.add(bonusText);

        const lines = gfx.createGroup();
        this.add(lines);

        let y = 0;
        bonus.watch(() => {
            lines.clear();
            y = top + bonusText.fontSize()*1.5;
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

        const total = makeText('', 70, 'center', 'top');
        bonus.watch(() => total.text(`TOTAL: ${score(bonus.total??0)}`).y(y+20).visible(bonus.total !== undefined));
        this.add(total);
    }
}