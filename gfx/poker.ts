import { Group, ImageView } from 'aminogfx-gl';
import { Poker, Card, getFileForCard } from '../modes/poker';
import { gfx, makeImage, Screen, Image, makeText, ModeGroup } from '../gfx';
import { onChange } from '../state';
import { tryNum, comma, money } from '../util';
import { machine } from '../machine';
import { onAny } from '../events';
import { Mode } from '../mode';

export class PokerGfx extends ModeGroup {
    bet = makeText('BET: 0', 40);
    pot = makeText('POT: 0', 40);
    winnings = makeText('winnings', 40, 'center', 'middle');
    player = makeText('PLAYER 1', 30, 'center', 'bottom').y(-PokerHand.h*1.05-20);
    dealer = makeText('DEALER', 30, 'center', 'top').y(PokerHand.h*1.05+20);
    doneInstr = makeText('SHOOTER LANE, EJECT, OR RAMP TO FINISH HAND', 40, 'center', 'bottom');
    playerHand!: PokerHand;
    dealerHand!: PokerHand;
    rects = gfx?.createGroup();
    constructor(
        public poker: Poker,
    ) {
        super(poker);
        this.z(poker.gPriority);

        this.add(this.playerHand = new PokerHand(poker, poker.playerHand).x(0).y(-PokerHand.h*1.05/2-20));
        poker.watch(() => this.playerHand.visible(poker.playerWins === undefined));
        this.add(this.dealerHand = new PokerHand(poker, poker.dealerHand).x(0).y(PokerHand.h*1.05/2+20));
        poker.watch(() => this.dealerHand.visible(poker.playerWins === undefined));
        this.add(new PokerHand(poker, poker.playerCardsUsed).x(0).y(-PokerHand.h*1.05/2-20));
        this.add(new PokerHand(poker, poker.dealerCardsUsed).x(0).y(PokerHand.h*1.05/2+20));

        this.add(this.pot.x(-Screen.w/4).y(0));
        poker.watch(() => this.pot.text('POT: '+money(poker.pot)));
        poker.watch(() => this.pot.visible(poker.playerWins === undefined));

        this.add(this.bet.x(Screen.w/4).y(0));
        poker.watch(() => this.bet.text('BET: '+money(poker.bet)));
        poker.watch(() => this.bet.visible(poker.playerWins === undefined));

        this.add(this.player);
        poker.watch(() => this.player.text(`PLAYER ${poker.player.number}`+(poker.playerHandDesc? ': '+poker.playerHandDesc : '')));
        this.add(this.dealer);
        poker.watch(() => this.dealer.text('DEALER'+(poker.dealerHandDesc? ': '+poker.dealerHandDesc : '')));

        this.add(this.winnings);
        poker.watch(() => {
            this.winnings.visible(poker.playerWins !== undefined);
            if (poker.playerWins !== undefined)
                this.winnings.text(`${poker.playerWins? 'PLAYER':'DEALER'} WINS ${money(poker.pot)}`);
        });

        this.add(this.doneInstr.y(Screen.h*.49));
        poker.watch(() => this.doneInstr.visible(poker.step === 7 && !poker.closeShooter));
        poker.watch(() => {
            const places = ['Shooter Lane'];
            if (machine.lEjectShowCards.lit()) places.push('Eject');
            if (machine.lRampShowCards.lit()) places.push('Ramp');
            this.doneInstr.text('finish hand at '+places.nonOxford('or'));
        });

        poker.watch(() => {
            this.rects.clear();
            for (let i=1; i<=13; i++) {
                const count = poker.slots.filter(c => c?.num === i).length;
                const r = gfx.createRect().w(Screen.w/13).h(count * Screen.h*.03).fill('#0000AA');
                r.x((i-1)*Screen.w/13 - Screen.w/2);
                r.y(Screen.h/2);
                r.originY(1);
                this.rects.add(r);
            }
        });
        this.add(this.rects);
    }
}

export class PokerHand extends Group {
    static w = 100;
    static spacing = 100/7;
    static h = 150;
    constructor(
        public mode: Mode,
        public hand: (Card|null)[],
        readonly = false,
    ) {
        super(gfx);
        this.originX(0.5).originY(0.5);
        this.w(PokerHand.w);
        this.h(PokerHand.h);

        this.add(gfx.createRect().w.watch(this.w).h(this.h()).fill('#00ff00').opacity(0.5).z(-.1));

        if (!readonly)
            mode.listen(onChange(hand), (e) => {
                const i = tryNum(e.prop);
                if (i !== undefined && i < this.children.length)
                    (this.children[i] as Image).set(getFileForCard(this.hand[i]));
                else
                    this.refresh();

                this.visible(hand.length > 0);
            });
        this.refresh();
    }

    refresh() {
        if (this.hand.length !== this.children.length) {
            this.clear();
            this.w(PokerHand.w * this.hand.length + PokerHand.spacing*(this.hand.length-1));
            for (let i=0; i<this.hand.length; i++) {
                const img = makeImage('', 100, this.h(), false);
                img.x((PokerHand.w + PokerHand.spacing)*this.children.length);
                this.add(img);
            }
        }
        let i=0;
        for (const card of this.hand) {
            const file = getFileForCard(card);
            (this.children[i++] as Image).set(file);

        }
    }
}