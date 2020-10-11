import { MachineOutputs, machine, SkillshotAward } from '../machine';
import { Mode, Modes } from '../mode';
import { PokerGfx } from '../gfx/poker';
import { State } from '../state';
import { Outputs } from '../outputs';
import { DropDownEvent, DropBankCompleteEvent, DropBankResetEvent } from '../drop-bank';
import { onSwitchClose, onAnySwitchClose, onAnyPfSwitchExcept } from '../switch-matrix';
import { screen, alert, makeText, gfx, addToScreen, gWait } from '../gfx';
import { Log } from '../log';
import { Player } from './player';
import { KnockTarget, ResetMechs as ResetDropBanks, ResetMechs } from '../util-modes';
import { Color } from '../light';
import { StraightMb } from './straight.mb';
import { Events, Priorities } from '../events';
import { fork } from '../promises';
import { comma, seq, range, repeat, money, round } from '../util';
import { Rng } from '../rand';
import { MPU } from '../mpu';
import { Tree } from '../tree';


export class Poker extends Mode {
    static BankStart = 3000;
    static BetStart = 100;

    readonly playerHand: (Card|null)[] = [];
    readonly dealerHand: (Card|null)[] = [];

    deck!: Card[];

    step = 2;

    readonly slots: (Card|null)[] = [];

    pot = 0;
    bet = Poker.BetStart;
    playerWins?: boolean;
    readonly playerCardsUsed: Card[] = [];
    readonly dealerCardsUsed: Card[] = [];
    closeShooter = false;
    finishShow?: any;

    playerHandDesc?: string;
    dealerHandDesc?: string;

    bank = Poker.BankStart;
    cardRng!: Rng;
    skillshotRng!: Rng;
    handsWon = 0;
    handsPlayed = 0;
    handsForMb = 2;
    wasQuit = false;
    cashValue = 200;

    newModes = new Set<number>();
    newMbs = new Map<'StraightMb'|'FlushMb', Card[]>();

    constructor(
        public player: Player,
    ) {
        super(Modes.Poker);
        this.cardRng = player.rng();
        this.skillshotRng = player.rng();
        State.declare<Poker>(this, ['playerHand', 'dealerHand', 'slots', 'pot', 'dealerHandDesc', 'playerWins', 'playerCardsUsed', 'playerHandDesc', 'dealerCardsUsed', 'step', 'closeShooter', 'newMbs', 'newModes']);
        player.storeData<Poker>(this, ['cashValue', 'bank', 'bet', 'skillshotRng', 'cardRng', 'handsWon', 'handsForMb', 'handsPlayed', 'wasQuit']);
        this.deal();

        this.bet = (this.bet+Poker.BetStart)/2;

        const outs: any  = {};
        for (const target of machine.dropTargets) {
            outs[target.image.name] = () => this.step<7? getFile(this.slots[target.num]) : undefined;
        }
        this.out = new Outputs(this, {
            ...outs,
            rampUp: () => machine.lRampShowCards.lit()? false : undefined,
            lockPost: () => machine.lRampShowCards.lit()? false : undefined,
            upperEject: () => machine.lEjectShowCards.lit()? false : undefined,
            lShooterShowCards: () => this.step >= 7? [Color.White] : [],
            lEjectShowCards: () => this.step >= 7? [Color.White] : [],
            lRampShowCards: () => this.step >= 7? [Color.White] : [],
            shooterDiverter: () => !this.closeShooter,
            getSkillshot: () => () => this.getSkillshot(),
        });

        this.listen(e => e instanceof DropDownEvent, (e: DropDownEvent) => {
            const target = e.target;
            if (this.slots[target.num] && this.step < 7) {
                this.playerHand[this.step] = this.slots[target.num];
                this.slots[target.num] = null;
                this.dealerHand[this.step] = {
                    ...this.deck.shift()!,
                    flipped: this.step + 1 === 7,
                };
                this.pot += this.bet * 2;
                this.bank -= this.bet;
                this.step++;

                // this.qualifyModes();

                if (this.step === 7) {
                    for (let i=0; i<3; i++) {
                        if (machine.rightBank.targets.slice(i+1).every(t => t.state))
                            break;
                        if (!machine.rightBank.targets[i].state) {
                            fork(KnockTarget(this, i));
                        }
                    }
                }
            }
        });

        this.watch(() => this.step, () => this.qualifyModes());
        this.watch(() => {
            {
                const [c, hand] = bestHand((this.playerCardsUsed.length? this.playerCardsUsed:this.playerHand).filter(c => !!c && !c.flipped) as Card[], 5);
                if (hand > Hand.Card) {
                    this.playerHandDesc = HandNames[hand];
                } else {
                    this.playerHandDesc = undefined;
                }
            }
            {
                const [c, hand] = bestHand((this.dealerCardsUsed.length? this.dealerCardsUsed:this.dealerHand).filter(c => !!c && !c.flipped) as Card[], 5);
                if (hand > Hand.Card) {
                    this.dealerHandDesc = HandNames[hand];
                } else {
                    this.dealerHandDesc = undefined;
                }
            }
        });

        this.listen([onAnySwitchClose(machine.sRampMade, machine.sUpperEject, machine.sShooterLane), () => this.step === 7], async (e) => {
            // const done = await Events.waitPriority(1);
            this.closeShooter = e.sw === machine.sShooterLane;
            await this.showCards();

            // if (e.sw === machine.sShooterLane) {
            //     this.player.poker = new Poker(this.player);
            //     this.player.addTemp(this.player.poker);
            // }
            // done();
        });

        this.listen(e => e instanceof DropBankResetEvent, (e: DropBankResetEvent) => {
            for (const target of e.bank.targets) {
                if (this.deck.length === 0) return;
                const i = target.num;
                if (!this.slots[i]) {
                    this.slots[i] = this.deck.shift()!;
                }
            }
        });

        this.listen(onSwitchClose(machine.sActionButton), () => {
            if (this.step <= 2 && machine.sShooterLane.state && this.handsPlayed>0) {
                this.wasQuit = true;
                player.listen(onAnyPfSwitchExcept(machine.sShooterLane, machine.sShooterLower), () => {
                    this.wasQuit = false;
                    return 'remove';
                });
                this.end();
            } else {
                return this.snail();
            }
        });


        addToScreen(() => new PokerGfx(this));
    }

    
    static async start(player: Player): Promise<Poker|false> {
        const finish = await Events.tryPriority(Priorities.StartPoker);
        if (!finish) return false;

        if (!player.curMode) {
            const poker = new Poker(player);
            player.focus = poker;
            if (MPU.isConnected || gfx) {
                await ResetMechs(poker);
            }
            await gWait(500, 'poker settle');
            finish();
            return poker;
        } else {
            finish();
            return false;
        }
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
        this.deck = Poker.makeDeck(this.cardRng);
        this.step = 2;

        const totals = {
            [Suit.Clubs]: 0,
            [Suit.Spades]: 0,
            [Suit.Hearts]: 0,
            [Suit.Diamonds]: 0,
        };

        Log.log('game', 'suit distribution: %j', totals);

        for (let i=0; i<this.step; i++) {
            this.playerHand.push(this.deck.shift()!);
        }
        for (let i=0; i<20; i++) {
            const card = this.deck.shift()!;
            this.slots.push(card);
            totals[card.suit]++;
        }
        for (let i=0; i<this.step; i++) {
            this.dealerHand.push({...this.deck.shift()!, flipped: true});
            this.pot += this.bet * 2;
            this.bank -= this.bet;
        }
        for (let i=0; i<7-this.step; i++) {
            this.playerHand.push(null);
            this.dealerHand.push(null);
        }

        this.qualifyModes();

    // }
        Log.info('game', 'deal complete');
        // console.profileEnd();
    }

    qualifyModes() {
        const cards = this.playerHand.filter(c => !!c) as Card[];
        const flushes = findFlushes(cards);
        const straights = findStraights(cards);
        const pairs = findPairs(cards);
        for (const pair of pairs) {
            if (!this.newModes.has(pair[0].num)) {
                Log.info('game', 'qualified mode %i', pair[0].num);
                // this.newModes.add(pair[0].num);
                // alert(`${getRank(pair[0])} mode qualified`);
            }
        }
        for (const straight of straights) {
            if (!this.newMbs.size) {
            // if (!this.newMbs.has('StraightMb')) {
                Log.info('game', 'qualified straight multiball');
                alert('multiball qualified');
            }
            this.newMbs.set('StraightMb', straight);
            break;
        }
        if (flushes.length > 0) {
            if (!this.newMbs.size) {
            // if (!this.newMbs.has('FlushMb')) {
                Log.info('game', 'qualified flush multiball');
                alert('multiball qualified');
            }
            this.newMbs.set('FlushMb', flushes[0]);
        }
        if (pairs.length >= 2 && pairs[0].length > 2) {
            // full house
            if (!this.newMbs.size) {
            // if (!this.newMbs.has('FlushMb')) {
                Log.info('game', 'qualified full house multiball');
                alert('multiball qualified');
            }
            this.newMbs.set('StraightMb', [...pairs[0], ...pairs[1]]);
        }
    }

    async showCards() {
        this.step++;
        this.finishShow = await Events.waitPriority(Priorities.ShowCards);
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
        this.handsPlayed++;
        if (this.playerWins) {
            this.bank += this.pot;
            this.handsWon++;
        }
        if (this.handsPlayed >= this.handsForMb) {
            this.handsForMb += 3;
                
            if (!this.player.mbsQualified.size) {
            // if (!this.player.mbsQualified.has('HandsMb')) {
                Log.info('game', 'qualified hands multiball');
                void gWait(200, 'hand mb qual').then(() => alert('hand multiball qualified', undefined, `${this.handsPlayed} hands played`));
            }
            this.player.mbsQualified.set('HandMb', result.aCards);
        }
        
        await gWait(5000, 'showing cards');
        this.end();
    }

    end() {
        for (const mode of this.newModes)
            this.player.modesQualified.add(mode);
        for (const [mb, hand] of this.newMbs)
            this.player.mbsQualified.set(mb, hand);

        if (this.finishShow)
            this.finishShow();
        return super.end();
    }

    static makeDeck(rng: Rng): Card[] {
        const deck: Card[] = [];

        const findCard = (num?: number, suit?: Suit) => deck.findIndex(x => (x.num === num || num===undefined) && (x.suit === suit || suit===undefined));
        const getCard = (num?: number, suit?: Suit) => {
            const i = findCard(num, suit);
            if (i===-1) return undefined;
            return deck.splice(i, 1)[0];
        };


        const nums = repeat(0, 15);
        for (let i=0; i<2; i++) {
            const straightLow = rng.randRange(1, 10);
            const straightHigh = Math.min(rng.randRange(4, 7) + straightLow, 14);
            for (let x=straightLow; x<=straightHigh; x++)
                nums[x]++;
        }
        // for (let i=0; i<1; i++) {
        //     const straightLow = rng.randRange(1, 5);
        //     const straightHigh = Math.min(rng.randRange(4, 7) + straightLow, 14);
        //     for (let x=straightLow; x<=straightHigh; x++)
        //         nums[x]++;
        // }
        // for (let i=0; i<1; i++) {
        //     const straightLow = rng.randRange(5, 10);
        //     const straightHigh = Math.min(rng.randRange(4, 7) + straightLow, 14);
        //     for (let x=straightLow; x<=straightHigh; x++)
        //         nums[x]++;
        // }
        for (let i=0; i<3; i++) {
            nums[rng.randRange(1,14)]++;
        }
        
        const badSuit = rng.randSelect(...Object.values(Suit));
        const goodSuit = {
            [Suit.Clubs]: Suit.Spades,
            [Suit.Spades]: Suit.Clubs,
            [Suit.Hearts]: Suit.Diamonds,
            [Suit.Diamonds]: Suit.Hearts,
        }[badSuit];
        const suitCounts = {
            [Suit.Clubs]: 0,
            [Suit.Spades]: 0,
            [Suit.Hearts]: 0,
            [Suit.Diamonds]: 0,
        };
        for (const suit of Object.values(Suit)) {
            if (suit === goodSuit)
                suitCounts[suit] = rng.randRange(11, 13);
            else if (suit === badSuit)
                suitCounts[suit] = rng.randRange(2, 5);
            else
                suitCounts[suit] = rng.randRange(4, 6);
        }

        let totalNums = nums.sum();
        while (totalNums < 20) {
            if (nums[rng.randRange(1,14)]) {
                totalNums++;
                nums[rng.randRange(1,14)]++;
            }
        }

        nums.flatMap((count, num) => repeat(num, count)).shuffle(() => rng.rand()).forEach((num) => {
            if (num < 1) return;
            if (num === 14) {
                num = 1;
            }

            let j=0;
            for (; j<10; j++) {
                const suit = rng.weightedSelect(...Object.values(Suit).map<[number, Suit]>(suit => ([suitCounts[suit]*suitCounts[suit], suit])));
                if (findCard(num, suit) === -1) {
                    deck.push({num, suit});
                    suitCounts[suit]--;
                    break;
                }
            }

            if (j >= 4) {
                for (const suit of Object.values(Suit).shuffle(() => rng.rand()))
                    if (findCard(num, suit) === -1) {
                        deck.push({num, suit});
                        break;
                    }
            }
        });
        const totals = {
            [Suit.Clubs]: 0,
            [Suit.Spades]: 0,
            [Suit.Hearts]: 0,
            [Suit.Diamonds]: 0,
        };
        for (let i=0; i<deck.length; i++) {
            const card = deck[i];
            totals[card.suit]++;
        }

        deck.shuffle(() => rng.rand());


        const rest: Card[] = [];

        for (let i=1; i<=13; i++) {
            for (const suit of Object.values(Suit)) {
                if (findCard(i, suit) === -1)
                    rest.push({num: i, suit});
            }
        }
        rest.shuffle(() => rng.rand());

        return [...deck, ...rest];

        // for (let i=1; i<=13; i++) {
        //     for (const suit of Object.values(Suit)) {
        //         deck.push({num: i, suit});
        //     }
        // }

        // deck.shuffle(() => rng.rand());

        // const suits = Object.values(Suit).shuffle(() => rng.rand());
        // const badSuit = suits[0];
        // const goodSuit = {
        //     [Suit.Clubs]: Suit.Spades,
        //     [Suit.Spades]: Suit.Clubs,
        //     [Suit.Hearts]: Suit.Diamonds,
        //     [Suit.Diamonds]: Suit.Hearts,
        // }[badSuit];
        // const straightLow = rng.randRange(1, 10);
        // const straightHigh = rng.randRange(4, 7) + straightLow;

        // const flush = seq(rng.randRange(6, 10)).map(x => getCard(undefined, goodSuit)!);
        // const straight1 = range(straightLow, straightHigh).map(r => getCard(r)!);
        // const straight2 = range(straightLow + rng.randRange(-2, 2), straightHigh + rng.randRange(-2, 2)).map(r => getCard(r)!);
        // const front = [
        //     ...flush,
        //     ...straight1,
        //     ...straight2,
        // ].filter(x => !!x);
        // const leftOvers = seq(rng.randRange(7, 11)).map(x => getCard(undefined, badSuit)!).filter(x => !!x);

        // const newDeck = [...front, ...deck, ...leftOvers];
        // const used = newDeck.slice(0, 26).shuffle(() => rng.rand());
        // const rest = newDeck.slice(26).shuffle(() => rng.rand());
        // return [...used, ...rest];
    }

    getSkillshot(): Partial<SkillshotAward>[] {
        const base = 10;
        const switches = ['first switch','second switch','third switch', 'upper lanes','upper eject hole','left inlane'];
        const mults = [
            this.step<=2? [[1, 0]] : [[3, -8, -2], [4, 1, 5], [1, -10, -5]],
            [[3, -10, -4], [1, -10, -6], [4, 3, 10], [2, 15, 30]],
            [[3, -10, -3], [4, 3, 10], [1, 20, 40]],
            [[1, 10, 20], [4, 3, 10], [1, -10, -5]],
            [[1, 10, 30], [4, 3, 10]],
            [[3, -10, -2], [5, 3, 9], [1, 10, 30]],
        ];
        return [...switches.map((sw, i) => {
            const percent = base * this.skillshotRng.weightedRange(...mults[i] as any);
            let change = round(percent, 10);
            if (this.bet + change < 0) change = -this.bet;
            return {
                switch: sw,
                display: change? money(change, 0, '+') : '',
                collect: () => this.bet += change,
            };
        }), { award: 'plunge to adjust bet amount'}];
    }

    snail() {
        if (machine.sShooterLane.state) return;
        if (this.player.chips < 2) return;
        if (this.step <= 2 || this.step>=7)
            return;

        this.player.chips -= 2;

        this.pot -= this.bet * 2;
        this.bank += this.bet;

        this.playerHand[this.step-1] = null;
        this.dealerHand[this.step-1] = null;
        this.step--;
    }
}

function getFile(card: Card|null) {
    if (!card) return 'empty';
    if (card.flipped) return 'back';
    // return card.num+card.suit+'-s';
    
    return getRank(card)+card.suit.toUpperCase();
}
export const getFileForCard = getFile;

function getRank(card: Card) {
    let num = `${card.num}`;
    if (card.num>10) num = 'JQK'.charAt(card.num-11);
    if (num === '1') num = 'A';
    return num;
}

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

export const HandNames = {
    [Hand.Card]: 'Card',
    [Hand.Pair]: 'Pair',
    [Hand.TwoPair]: 'Two Pair',
    [Hand.ThreeOfAKind]: 'Three Of A Kind',
    [Hand.Straight]: 'Straight',
    [Hand.Flush]: 'Flush',
    [Hand.FullHouse]: 'Full House',
    [Hand.FourOfAKind]: 'Four Of A Kind',
    [Hand.StraightFlush]: 'Straight Flush',
    [Hand.RoyalFlush]: 'Royal Flush',
    [Hand.FiveOfAKind]: 'Five Of A Kind',
};

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
        aWon: aRank > bRank || (aRank === bRank && val(aHand[0]) > val(bHand[0])),
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