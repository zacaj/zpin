import { Group, ImageView } from 'aminogfx-gl';
import { Poker, Card, getFileForCard } from '../modes/poker';
import { gfx, makeImage, Screen, Image, makeText } from '../gfx';
import { onChange } from '../state';
import { tryNum } from '../util';

export class PokerGfx extends Group {
    bet = makeText('BET: 0', 40);
    pot = makeText('POT: 0', 40);
    winnings = makeText('winnings', 40, 'center', 'middle');
    player = makeText('PLAYER 1', 30, 'center', 'bottom');
    playerHand!: PokerHand;
    dealerHand!: PokerHand;
    constructor(
        public poker: Poker,
    ) {
        super(gfx);
        this.z(1);

        this.add(this.playerHand = new PokerHand(poker, poker.playerHand).x(0).y(-PokerHand.h*1.05/2-20));
        poker.watch(onChange(poker, 'playerWins'), () => this.playerHand.visible(poker.playerWins === undefined));
        this.add(this.dealerHand = new PokerHand(poker, poker.dealerHand).x(0).y(PokerHand.h*1.05/2+20));
        poker.watch(onChange(poker, 'playerWins'), () => this.dealerHand.visible(poker.playerWins === undefined));
        this.add(new PokerHand(poker, poker.playerCardsUsed).x(0).y(-PokerHand.h*1.05/2-20));
        this.add(new PokerHand(poker, poker.dealerCardsUsed).x(0).y(PokerHand.h*1.05/2+20));

        this.add(this.pot.x(-Screen.w/4).y(0));
        poker.watch(onChange(poker, 'pot'), () => this.pot.text('POT: '+poker.pot.toFixed(0)));
        poker.watch(onChange(poker, 'playerWins'), () => this.pot.visible(poker.playerWins === undefined));

        this.add(this.bet.x(Screen.w/4).y(0));
        poker.watch(onChange(poker, 'bet'), () => this.bet.text('BET: '+poker.bet.toFixed(0)));
        poker.watch(onChange(poker, 'playerWins'), () => this.bet.visible(poker.playerWins === undefined));

        this.add(makeText('DEALER', 30, 'center', 'top').y(PokerHand.h*1.05+20));
        this.add(this.player.y(-PokerHand.h*1.05-20));

        this.add(this.winnings);
        poker.watch(onChange(poker, 'playerWins'), () => {
            this.winnings.visible(poker.playerWins !== undefined);
            if (poker.playerWins !== undefined)
                this.winnings.text(`${poker.playerWins? 'PLAYER':'DEALER'} WINS ${poker.pot}`);
        });
    }
}

class PokerHand extends Group {
    static w = 100;
    static spacing = 100/7;
    static h = 150;
    constructor(
        public poker: Poker,
        public hand: (Card|null)[],
    ) {
        super(gfx);
        this.originX(0.5).originY(0.5);
        this.w(PokerHand.w);
        this.h(PokerHand.h);
        this.z(poker.priority);

        this.add(gfx.createRect().w.watch(this.w).h(this.h()).fill('#00ff00').opacity(0.5).z(-1));

        poker.listen(onChange(hand), (e) => {
            const i = tryNum(e.prop);
            if (i !== undefined && i < this.children.length)
                Image.set(this.children[i] as ImageView, getFileForCard(this.hand[i]));
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
            Image.set(this.children[i++] as ImageView, file);

        }
    }
}