import { MachineOutputs, machine } from '../machine';
import { Mode } from '../mode';
import { PokerGfx } from '../gfx/poker';
import { State } from '../state';
import { Outputs } from '../outputs';
import { DropDownEvent } from '../drop-bank';
import { onSwitchClose, onAnySwitchClose } from '../switch-matrix';
import { screen, queueDisplay, alert } from '../gfx';
import { Log } from '../log';
import { Player } from './player';
import { KnockTarget, ResetMechs as ResetDropBanks } from '../util-modes';
import { wait } from '../timer';
import { Color } from '../light';
import { StraightMb } from './straight.mb';
import { Events } from '../events';


export class Poker extends Mode<MachineOutputs> {
    readonly playerHand: (Card|null)[] = [];
    readonly dealerHand: (Card|null)[] = [];

    deck = this.makeDeck();

    step = 2;

    readonly slots: (Card|null)[] = [];

    pot = 0;
    bet = 100;
    playerWins?: boolean;
    readonly playerCardsUsed: Card[] = [];
    readonly dealerCardsUsed: Card[] = [];

    constructor(
        public player: Player,
    ) {
        super(10);
        State.declare<Poker>(this, ['playerHand', 'dealerHand', 'slots', 'bet', 'pot', 'playerWins', 'playerCardsUsed', 'dealerCardsUsed', 'step']);
        this.deal();

        const outs: any  = {};
        for (const target of machine.dropTargets) {
            outs[target.image.name] = () => getFile(this.slots[target.num]);
        }
        outs.rampUp = (up: boolean) => this.step !== 7 && up;
        this.out = new Outputs(this, {
            ...outs,
            lockPost: () => this.step===7? false : undefined,
            lShooterShowCards: () => this.step === 7? [Color.Green] : [],
            lEjectShowCards: () => this.step === 7 && player.modesQualified.size>0? [Color.Green] : [],
            lRampShowCards: () => this.step === 7 && player.mbsQualified.size>0? [Color.Green] : [],
            shooterDiverter: () => this.step===7? true : undefined,
        });

        this.listen(e => e instanceof DropDownEvent, (e: DropDownEvent) => {
            const target = e.target;
            if (this.slots[target.num] && this.step < 7) {
                this.playerHand[this.step] = this.slots[target.num];
                this.slots[target.num] = null;
                this.dealerHand[this.step] = {
                    ...this.deck.pop()!,
                    flipped: this.step + 1 === 7,
                };
                this.pot += this.bet * 2;
                this.player.bank -= this.bet;
                this.step++;

                this.qualifyModes();

                if (this.step === 7) {
                    for (let i=0; i<3; i++)
                        if (!machine.rightBank.targets[i].state)
                            this.addChild(new KnockTarget(i));
                }
            }
        });

        this.listen([onAnySwitchClose(machine.sRampMade, machine.sUpperEject, machine.sShooterLane), () => this.step === 7], async (e) => {
            // const done = await Events.waitPriority(1);
            await this.showCards();

            // if (e.sw === machine.sShooterLane) {
            //     this.player.poker = new Poker(this.player);
            //     this.player.addChild(this.player.poker);
            // }
            // done();
        });

        this.gfx?.add(new PokerGfx(this));
    }

    deal() {
        // console.profile('deal');
        this.playerWins = undefined;
        this.playerCardsUsed.clear();
        this.dealerCardsUsed.clear();
        Log.info('game', 'dealing cards...');
        // for (let i=0;i<100; i++) {
        this.playerHand.clear();
        this.dealerHand.clear();
        this.slots.clear();
        this.deck = this.makeDeck();
        this.step = 2;

        for (let i=0; i<this.step; i++) {
            this.playerHand.push(this.deck.pop()!);
            this.dealerHand.push({...this.deck.pop()!, flipped: true});
        }
        for (let i=0; i<7-this.step; i++) {
            this.playerHand.push(null);
            this.dealerHand.push(null);
        }

        for (let i=0; i<20; i++) {
            this.slots.push(this.deck.pop()!);
        }

        this.qualifyModes();

    // }
        Log.info('game', 'deal complete');
        // console.profileEnd();
    }

    qualifyModes() {
        const result = bestHand(this.playerHand.filter(c => !!c) as any);
        switch (result[1]) {
            case Hand.Pair:
            case Hand.TwoPair:
            case Hand.ThreeOfAKind:
            case Hand.FourOfAKind:
                if (!this.player.modesQualified.has(result[0][0].num)) {
                    Log.info('game', 'qualified mode %i', result[0][0].num);
                    this.player.modesQualified.add(result[0][0].num);
                    alert(`${result[0][0].num} mode qualified`);
                }
                break;
            case Hand.Straight:
                if (!this.player.mbsQualified.has(StraightMb)) {
                    Log.info('game', 'qualified straight multiball');
                    this.player.mbsQualified.add(StraightMb);
                    alert('straight multiball qualified');
                }
                break;
        }
    }

    async showCards() {
        const finish = await queueDisplay(this.gfx!, 1, 'poker winnings');
        Log.info('game', 'showing hand');
        for (let i=0; i<7; i++) {
            if (this.dealerHand[i]?.flipped)
                this.dealerHand.splice(i, 1, {...this.dealerHand[i]!, flipped: undefined});
        }
        const result = compareHands(this.playerHand as Card[], this.dealerHand as Card[]);
        this.playerWins = result.aWon;
        Log.info('game', 'poker results: %o', result);
        this.playerCardsUsed.set(result.aCards);
        this.dealerCardsUsed.set(result.bCards);
        if (this.playerWins)
            this.player.bank += this.pot;
        
        await wait(3000);
        finish();
        this.end();
        this.player.poker = undefined;
    }

    makeDeck(): Card[] {
        const deck: Card[] = [];
        for (let i=1; i<=13; i++) {
            for (const suit of Object.values(Suit)) {
                deck.push({num: i, suit});
            }
        }
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(this.player.rand() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }
}

function getFile(card: Card|null) {
    if (!card) return 'empty';
    if (card.flipped) return 'back';
    // return card.num+card.suit+'-s';
    let num = `${card.num}`;
    if (card.num>10) num = 'JQK'.charAt(card.num-11);
    if (num === '1') num = 'A';
    return num+card.suit.toLowerCase();
}
export const getFileForCard = getFile;

export interface Card {
    readonly num: number;
    readonly suit: Suit; 
    readonly flipped?: boolean;
}

export enum Suit {
    Hearts = 'h',
    Spades = 's',
    Clubs = 'c',
    Diamonds = 'd',
}

function val(card: Card): number {
    if (card.num === 1) return 14;
    return card.num;
}

export function findPairs(hand: Card[]): Card[][] {
    const pairs: Card[][] = [];
    for (let i=1; i<=13; i++) {
        const cards = hand.filter(c => c.num === i);
        if (cards.length > 1)
            pairs.push(cards);
    }

    pairs.sort((a, b) => {
        const size = b.length - a.length;
        if (size !== 0) return size;
        return val(b[0]) - val(a[0]);
    }); // biggest first
    return pairs;
}

export function findFlushes(hand: Card[]): Card[][] {
    const flushes: Card[][] = [];
    for (const suit of Object.values(Suit)) {
        const cards = hand.filter(c => c.suit === suit);
        if (cards.length >= 5) {
            cards.sort((a, b) => val(b) - val(a));
            flushes.push(cards.slice(0, 5));
        }
    }

    flushes.sort((a, b) => {
        const size = b.length - a.length;
        if (size !== 0) return size;
        return val(b[0]) - val(a[0]);
    }); // biggest first
    return flushes;
}

export function findStraights(hand: Card[]): Card[][] {
    let straights: Card[][] = [];
    const nums: Card[][] = [];
    for (let i=1; i<=13; i++) {
        const cards = hand.filter(c => c.num === i);
        nums[i] = cards;
    }
    nums[14] = nums[1];
    for (let i=1; i<=14-4; i++) {
        straights = [...straights, ...str(i, 5)];
    }

    function str(start: number, left: number): Card[][] {
        if (left === 1) {
            return nums[start+5-1].map(c => ([c]));
        }
        const s: Card[][] = [];
        for (const card of nums[start+5-left]) {
            const ss = str(start, left-1);
            for (const _s of ss) {
                if (_s.length === left-1)
                    s.push([card, ..._s]);
            }
        }
        return s;
    }
    for (const s of straights) {
        s.sort((a, b) => val(a) - val(b));
    }
    straights.sort((a, b) => val(b[4]) - val(a[4]));
    return straights;
}

export enum Hand {
    Card = 0,
    Pair = 1,
    TwoPair = 2,
    ThreeOfAKind = 3,
    Straight = 4,
    Flush = 5,
    FullHouse = 6,
    FourOfAKind = 7,
    StraightFlush = 8,
    RoyalFlush = 9,
    FiveOfAKind = 10,
}

export function bestHand(cards: Card[], max = Math.min(5, cards.length)): [Card[], Hand] {
    const flushes = findFlushes(cards);
    const straights = findStraights(cards);
    const pairs = findPairs(cards);
    if (max >= 5) {
        if (pairs[0]?.length === 5) return [pairs[0], Hand.FiveOfAKind];
        // if (straights[0]?[4]?.num === 1 && straights[0]?.map(c => c.suit).unique().length === 1) return [straights[0], 9];
        const straightFlushes = straights.filter(s => s.map(c => c.suit).unique().length === 1);
        if (straightFlushes.length > 0) {
            if (straightFlushes[0][4].num === 1) return [straightFlushes[0], Hand.RoyalFlush];
            else return [straightFlushes[0], Hand.StraightFlush];
        }
    }
    if (max >= 4) {
        if (pairs[0]?.length === 4) return [pairs[0], Hand.FourOfAKind];
    }
    const three = pairs.find(p => p.length === 3);
    const two = pairs.find(p => p.length === 2);
    if (max >= 5) {
        if (three && two) return [[...three, ...two], Hand.FullHouse];

        if (flushes.length > 0) return [flushes[0], Hand.Flush];

        if (straights.length > 0) return [straights[0], Hand.Straight];
    }
    if (max >= 3) {
        if (three) return [three, Hand.ThreeOfAKind];
    }
    if (max >= 4) {
        const twos = pairs.filter(p => p.length === 2);
        if (twos.length >= 2) return [twos.slice(0, 2).flat(), Hand.TwoPair];
    }
    if (max >= 2) {
        if (two) return [two, Hand.Pair];
    }
    return [[cards.reduce((prev, cur) => val(cur) > val(prev)? cur : prev, cards[0])], Hand.Card];
}

// does a beat b
export function compareHands(a: Card[], b: Card[], max = Math.min(5, a.length, b.length)): {
    aWon: boolean;
    aCards: Card[];
    aHand: Hand;
    bCards: Card[];
    bHand: Hand;
} {
    if (max <= 0) return {
        aWon: true,
        aCards: [],
        bCards: [],
        aHand: Hand.Card,
        bHand: Hand.Card,
    };
    const [aHand, aRank] = bestHand(a, max);
    const [bHand, bRank] = bestHand(b, max);
    if (bRank !== aRank || aHand.every((av, i) => av.num !== bHand[i].num)) return {
        aWon: aRank > bRank,
        aCards: aHand,
        bCards: bHand,
        aHand: aRank,
        bHand: bRank,
    };
    const sub = compareHands(a.remove(...aHand), b.remove(...bHand), max - aHand.length);
    return {
        aWon: sub.aWon,
        aCards: [...aHand, ...sub.aCards],
        bCards: [...bHand, ...sub.bCards],
        aHand: aRank,
        bHand: bRank,
    };
}