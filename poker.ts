import { MachineOutputs, machine } from './machine';
import { Mode } from './mode';
import { State } from './state';
import { Outputs } from './outputs';
import { DropDownEvent } from './drop-bank';

export class Poker extends Mode<MachineOutputs> {
    player: (Card|null)[] = [];
    dealer: (Card|null)[] = [];

    deck = makeDeck();

    step = 2;

    slots: (Card|null)[] = [];

    constructor() {
        super();
        State.declare<Poker>(this, ['player', 'dealer', 'slots']);
        this.deal();

        const outs: any  = {};
        for (const target of machine.dropTargets) {
            outs[target.image.name] = () => getFile(this.slots[target.num]);
        }
        this.out = new Outputs(this, outs);

        this.listen(e => e instanceof DropDownEvent, (e: DropDownEvent) => {
            const target = e.target;
            if (this.slots[target.num]) {
                this.player[this.step] = this.slots[target.num];
                this.slots[target.num] = null;
                this.dealer[this.step] = this.deck.pop()!;
                this.step++;

                if (this.step >= 7) {
                    this.deal();
                }
            }
        });
    }

    deal() {
        this.player = [];
        this.dealer = [];
        this.slots = [];
        this.deck = makeDeck();

        this.player.push(this.deck.pop()!);
        this.player.push(this.deck.pop()!);
        this.dealer.push(this.deck.pop()!);
        this.dealer.push(this.deck.pop()!);
        this.dealer[0]!.flipped = true;
        this.dealer[1]!.flipped = true;
        for (let i=0; i<5; i++) {
            this.player.push(null);
            this.dealer.push(null);
        }

        for (let i=0; i<20; i++) {
            this.slots.push(this.deck.pop()!);
        }

        this.step = 2;
    }
}

function getFile(card: Card|null) {
    if (!card) return 'empty';
    if (card.flipped) return 'back';
    // return card.num+card.suit+'-s';
    let num = `${card.num}`;
    if (card.num>10) num = 'JQK'.charAt(card.num-11);
    if (num === '1') num = 'A';
    return num+card.suit.toUpperCase();
}

function makeDeck(): Card[] {
    const deck: Card[] = [];
    for (let i=1; i<=13; i++) {
        for (const suit of Object.values(Suit)) {
            deck.push({num: i, suit});
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

interface Card {
    num: number;
    suit: Suit; 
    flipped?: true;
}

enum Suit {
    Hearts = 'h',
    Spades = 's',
    Clubs = 'c',
    Diamonds = 'd',
}