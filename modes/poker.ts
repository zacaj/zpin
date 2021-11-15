import { MachineOutputs, machine, SkillshotAward, Light } from '../machine';
import { Mode, Modes } from '../mode';
import { PokerGfx } from '../gfx/poker';
import { State } from '../state';
import { Outputs } from '../outputs';
import { DropDownEvent, DropBankCompleteEvent, DropBankResetEvent } from '../drop-bank';
import { onSwitchClose, onAnySwitchClose, onAnyPfSwitchExcept, Switch } from '../switch-matrix';
import { screen, alert, makeText, gfx, addToScreen, gWait, notify } from '../gfx';
import { Log } from '../log';
import { Player, SpinnerHit } from './player';
import { Effect, KnockTarget, MiscAwards, ResetMechs as ResetDropBanks, ResetMechs, ShimmerLights } from '../util-modes';
import { add, Color, light, many } from '../light';
import { StraightMb } from './straight.mb';
import { Events, Priorities } from '../events';
import { fork } from '../promises';
import { comma, seq, range, repeat, money, round, score } from '../util';
import { Rng } from '../rand';
import { MPU } from '../mpu';
import { Tree } from '../tree';
import { playSound, playVoice } from '../sound';
import { Skillshot } from './skillshot';
import { time, wait } from '../timer';
import { dFitText, dHash, dImage, dInvert, DisplayContent, dMany, dText } from '../disp';
import { FlushMb } from './flush.mb';
import { FullHouseMb } from './full-house.mb';

function dAdjustBet(amount: number): DisplayContent {
    return dMany(
        dImage(amount>0? 'raise_bet' : 'lower_bet'),
        dFitText(money(amount, 0, '+'), 95, 'baseline'),
    );
}

export class Poker extends Mode {
    override get nodes() {
        return [
            this.misc,
            ...this.tempNodes,
        ];
    }

    static BankStart = 5000;
    static BetStart = 150;

    readonly playerHand: (Card|null)[] = [];
    readonly dealerHand: (Card|null)[] = [];

    deck!: Card[];

    step = 2;

    readonly slots: (Card|null)[] = [];

    allowMbStart = true;
    pot = 0;
    bet = Poker.BetStart;
    playerWins?: boolean;
    readonly playerCardsUsed: Card[] = [];
    readonly dealerCardsUsed: Card[] = [];
    closeShooter = false;
    finishShow?: any;

    playerHandDesc?: string;
    dealerHandDesc?: string;

    misc!: MiscAwards;

    bank = Poker.BankStart;
    cardRng!: Rng;
    skillshotRng!: Rng;
    handsWon = 0;
    handsPlayed = 0;
    handsForMb = 1;
    wasQuit = false;
    cashValue = 150;
    biggestWin = 0;
    biggestLoss = 0;
    topCashout = 0;

    newModes = new Set<number>();
    newMbs = new Map<'StraightMb'|'FlushMb'|'FullHouseMb'|'RoyalFlushMb', Card[]>();

    get betAdjust(): number {
        return Math.max(20, round(this.bet * .15, 10));
    }
    adjustSide = -1;

    get showCardsReady(): boolean {
        return this.step >= 7;
    }

    bestHandAnnounced = Hand.Card;

    constructor(
        public player: Player,
    ) {
        super(Modes.Poker);
        this.cardRng = player.rng();
        this.skillshotRng = player.rng();
        State.declare<Poker>(this, ['playerHand', 'dealerHand', 'slots', 'allowMbStart', 'pot', 'dealerHandDesc', 'playerWins', 'adjustSide', 'playerCardsUsed', 'playerHandDesc', 'dealerCardsUsed', 'step', 'closeShooter', 'newMbs', 'newModes']);
        player.storeData<Poker>(this, ['cashValue', 'bank', 'bet', 'skillshotRng', 'cardRng', 'handsWon', 'handsForMb', 'handsPlayed', 'wasQuit', 'biggestWin', 'biggestLoss', 'topCashout']);
        this.deal();

        this.bet = round((this.bet+Poker.BetStart+Poker.BetStart+Poker.BetStart)/4, 10, -10000);

        this.misc = new MiscAwards(player);

        const outs: any  = {};
        for (const target of machine.dropTargets) {
            if (!target.image) continue;
            outs[target.image.name] = () => this.step<7 && this.slots[target.num] && !!this.playerCardsUsed? dImage(getFile(this.slots[target.num])) : undefined;
        }
        this.out = new Outputs(this, {
            ...outs,
            rampUp: () => this.showCardsReady || (this.player.mbReady && this.allowMbStart)? false : undefined,
            lockPost: () => this.showCardsReady? false : undefined,
            upperEject: () => this.showCardsReady? false : undefined,
            shooterDiverter: () => !this.closeShooter && !player.closeShooter,
            getSkillshot: () => (ss: Skillshot) => this.getSkillshot(ss),
            iRamp: (prev) => {
                // const mbReady = this.player.mbReady && this.allowMbStart;
                if (prev && (((time()/1500%2)|0)===0 || this.step < 7)) return undefined;
                if (this.step === 7) return dImage("finish_hand_ramp");
                if (this.step > 7) return undefined;
                return dAdjustBet(-this.betAdjust*this.adjustSide);
            },
            iSS5: () => this.step===7? dInvert(time()%600>400, dImage("finish_hand_eject")) : undefined,
            iSS1: () => this.step<7? dImage('change_bet') : 
                        this.step===7? dInvert(time()%500>400, ((time()/1500%2)|0)===0? dImage("finish_hand_shooter") : dImage('start_next_hand_shooter')) :
                        undefined,
            // iSpinner: () => this.step<7 && ((time()/1500%2)|0)===0? dAdjustBet(this.betAdjust*this.adjustSide) : undefined,
            lRampArrow: add(() => this.step===7, [Color.White, 'fl']),
            lEjectArrow: add(() => this.step===7, [Color.White, 'fl']),
            music: () => this.playerWins? null : undefined,
            // lMainTargetArrow: many(() => ({
            //     prev: true,
            //     [this.player.mbColor()]: !this.allowMbStart,
            //     [Color.Red]: this.allowMbStart,
            // })),
            // lLeftArrow: () => player.mbReady? (this.allowMbStart? [[Color.Red]] : [this.player.mbColor()]) : undefined,
        });
        
        // this.listen(onSwitchClose(machine.sRampMiniOuter), () => {
        //     if (!player.mbReady) return;
        //     this.allowMbStart = !this.allowMbStart;
        // });

        this.listen(e => e instanceof DropDownEvent, (e: DropDownEvent) => {
            if (player.mystery) return;
            const target = e.target;
            if (this.slots[target.num] && this.step < 7) {
                const card = this.slots[target.num];
                void playVoice(`card ${getRank(card!)}`);
                // return;
                this.playerHand[this.step] = card;
                this.slots[target.num] = null;
                this.dealerHand[this.step] = {
                    ...this.deck.shift()!,
                    flipped: this.step + 1 === 7,
                };
                this.pot += this.bet * 2;
                this.bank -= this.bet;
                this.step++;

                this.misc.setTarget(undefined, e.target);

                // this.qualifyModes();

                if (this.step === 7) {
                    this.handsPlayed++;
                    if (player.handMbQualified)
                        this.handsForMb++;
                    else if (this.handsPlayed >= this.handsForMb) {
                        this.handsForMb += this.handsPlayed<=1? 2 : 3;
                            
                        if (!this.player.mbsQualified.size) {
                            Log.info('game', 'qualified hands multiball');
                            alert('hand multiball qualified', 3000, `${this.handsPlayed} hands played`);
                            void playVoice('hand mb is lit');
                        }
                        this.player.mbsQualified.set('HandMb', this.playerHand.slice(0, 5).truthy());
                    }
                    if (this.player.mbsQualified.size || this.newMbs.size)
                        void playVoice('multiball is lit');
                    // this.misc.addTargets(7 - this.misc.targets.size);
                    fork(ResetDropBanks(this, machine.rightBank).then(() => {
                        for (let i=0; i<3; i++) {
                            if (machine.rightBank.targets.slice(i+1).every(t => t.state))
                                break;
                            if (!machine.rightBank.targets[i].state) {
                                fork(KnockTarget(this, i));
                            }
                        }
                    }));
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

        this.listen([
            onAnySwitchClose(machine.sRampMade, machine.sUpperEject, machine.sShooterLane, machine.sOuthole), 
            () => this.step === 7], 
        async (e) => {
            // const done = await Events.waitPriority(1);
            this.closeShooter = e.sw === machine.sShooterLane;
            if (e.sw !== machine.sOuthole || machine.ballsInPlay <= 1)
                await this.showCards(e.sw);

            // if (e.sw === machine.sShooterLane) {
            //     this.player.poker = new Poker(this.player);
            //     this.player.addTemp(this.player.poker);
            // }
            // done();
        });

        // this.listen(e => e instanceof DropBankResetEvent, (e: DropBankResetEvent) => {
        //     for (const target of e.bank.targets) {
        //         if (this.deck.length === 0) return;
        //         const i = target.num;
        //         if (!this.slots[i]) {
        //             this.slots[i] = this.deck.shift()!;
        //         }
        //     }
        // });

        this.listen(onSwitchClose(machine.sActionButton), () => {
            if (machine.sShooterLane.state) {
                if (this.player.number > 4)
                    void playVoice('folded', 75, true);
                else
                    void playVoice(`player ${this.player.number} folds`, 75, true);
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

        this.listen(onAnySwitchClose(machine.sLeftSling, machine.sRightSling), () => this.adjustSide *= -1);

        this.listen(onAnySwitchClose(machine.sLeftOrbit), () => {
            if (this.step < 7) {
                this.bet -= this.betAdjust*this.adjustSide;
                notify(`BET ${money(this.betAdjust*this.adjustSide, 0, '+')}`);
            }
        });
        // this.listen(e => e instanceof SpinnerHit, () => {
        //     if (this.step < 7)
        //         this.bet += this.betAdjust*this.adjustSide;
        // });

        // award chips on bank complete
        // this.listen<DropBankCompleteEvent>(e => e instanceof DropBankCompleteEvent, (e) => {
        //     for (let i=1; i<e.bank.targets.length; i++)
        //         player.addChip();
        // });

        addToScreen(() => new PokerGfx(this));
    }

    
    static async start(player: Player): Promise<Poker|false> {
        const finish = await Events.tryPriority(Priorities.StartPoker);

        if (!finish) return false;
        // return false;

        if (!player.curMode) {
            const poker = new Poker(player);
            player.focus = poker;
            if (MPU.isLive || gfx) {
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
        void playSound('shuffle');
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
        
        if (this.player.royalFlushReady) {
            const rng = new Rng();
            if (this.player.royalFlushReady === 'missed')
            { // dealer's cards
                const suit = rng.randSelect(...Object.values(Suit));
                const cards = seq(7).map(_ => ({
                    num: rng.randSelect(Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace),
                    suit,
                }));
                this.deck.splice(0, 0, ...cards);
            }

            { // player's
                const suit = rng.randSelect(...Object.values(Suit).remove(this.deck[0].suit));
                const cards = [
                    {
                        num: Rank.Queen,
                        suit,
                    },
                    {
                        num: Rank.Ten,
                        suit,
                    },
                    {
                        num: Rank.Jack,
                        suit,
                    },
                    {
                        num: Rank.Ace,
                        suit,
                    },
                    {
                        num: Rank.King,
                        suit,
                    },
                ].shuffle();
                const counts = [3, 5,4,2,3].reverse();
                let j = 0;
                for (const count of counts) {
                    for (let i=0; i<count; i++) {
                        this.deck.unshift({...cards[j]});
                    }
                    j++;
                }
                this.deck.unshift({...rng.randSelect(...cards)});
                this.deck.unshift({...rng.randSelect(...cards)});
            }
        }
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
        for (let i=0; i<machine.dropTargets.length; i++) {
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

    // eslint-disable-next-line complexity
    qualifyModes() {
        const cards = this.playerHand.filter(c => !!c) as Card[];
        const [_, hand] = bestHand(cards, 5);
        if (hand > this.bestHandAnnounced) {
            this.bestHandAnnounced = hand;
            switch (hand) {
                case Hand.Pair:
                    void playVoice('good for a pair');
                    break;
                case Hand.TwoPair:
                    void playVoice('thats two pair');
                    break;
                case Hand.FullHouse:
                    void playVoice('looking at a full house');
                    break;
                case Hand.ThreeOfAKind:
                    void playVoice('were looking at a set');
                    break;
                case Hand.Straight:
                    void playVoice('thats-a straight');
                    break;
                case Hand.Flush:
                    void playVoice('thats-a flush');
                    break;
                case Hand.RoyalFlush:
                    void playVoice('a royal flush');
                    break;
            }
        }

        if (!this.player.royalFlushReady) {
            const flushes = findFlushes(cards);
            const straights = findStraights(cards);
            const pairs = findPairs(cards);
            // for (const pair of pairs) {
            //     if (!this.newModes.has(pair[0].num)) {
            //         // Log.info('game', 'qualified mode %i', pair[0].num);
            //         // this.newModes.add(pair[0].num);
            //         // alert(`${getRank(pair[0])} mode qualified`);
            //     }
            // }
            for (const straight of straights) {
                // if (!this.newMbs.size) {
                if (!this.newMbs.has('StraightMb') && !this.player.mbsQualified.has('StraightMb')) {
                    Log.info('game', 'qualified straight multiball');
                    alert('straight multiball qualified');
                }
                this.newMbs.set('StraightMb', straight);
                break;
            }
            if (flushes.length > 0) {
                // if (!this.newMbs.size) {
                if (!this.newMbs.has('FlushMb') && !this.player.mbsQualified.has('FlushMb')) {
                    Log.info('game', 'qualified flush multiball');
                    alert('flush multiball qualified');
                }
                this.newMbs.set('FlushMb', flushes[0]);
            }
            if (pairs.length >= 2 && pairs[0].length > 2) {
                // full house
                // if (!this.newMbs.size) {
                if (!this.newMbs.has('FullHouseMb') && !this.player.mbsQualified.has('FullHouseMb')) {
                    Log.info('game', 'qualified full house multiball');
                    alert('full house multiball qualified');
                }
                this.newMbs.set('FullHouseMb', [...pairs[0], ...pairs[1]]);
            }
        }
        else {
            const hand = bestHand(this.playerHand.truthy());
            if (hand[1] === Hand.RoyalFlush) {
                if (!this.newMbs.has('RoyalFlushMb') && !this.player.mbsQualified.has('RoyalFlushMb')) {
                    Log.info('game', 'qualified royal flush multiball');
                    alert('royal flush qualified');
                }
                this.newMbs.set('RoyalFlushMb', hand[0]);
            }
        }
    }

    // eslint-disable-next-line complexity
    async showCards(sw: Switch) {
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
        fork(wait(1000).then(() => playVoice(this.playerWins? "player win" : "crowd groan", undefined, true)));
        // if (this.playerWins)
        //     fork(ShimmerLights(this.player.overrides, 900, Color.White));
        this.playerCardsUsed.set(result.aCards);
        this.dealerCardsUsed.set(result.bCards);
        if (this.playerWins) {
            this.handsWon++;
            if (this.pot > this.biggestWin)
                this.biggestWin = this.pot;
            this.player.audit('poker win', this.pot);
        }
        else {
            if (this.pot > this.biggestLoss, this.pot)
                this.biggestLoss = this.pot;
            this.player.audit('poker loss');
        }
        await gWait(1500, 'showing cards');
        for (const [mb, hand] of this.newMbs) {
            const [g, prom] =  this.player.qualifyMb(mb, hand, 2000);
            await prom;
            if (!g) {
                // mb already qualified
                switch (mb) {
                    case 'StraightMb':
                        if (!this.player.store.StraightMb.value)
                            this.player.store.StraightMb.value = StraightMb.startValue;
                        this.player.store.StraightMb.value *= 2;
                        await alert(`STRAIGHT MB VALUE INCREASED`, 3000)[1];
                        break;
                    case 'FlushMb':
                        if (!this.player.store.FlushMb.standupMult)
                            this.player.store.FlushMb.standupMult = 2;
                        else
                            this.player.store.FlushMb.standupMult++;
                        if (!this.player.store.FlushMb.targetMult)
                            this.player.store.FlushMb.targetMult = 2;
                        else
                            this.player.store.FlushMb.targetMult++;
                        if (!this.player.store.FlushMb.standupMult)
                            this.player.store.FlushMb.shotMult = 2;
                        else
                            this.player.store.FlushMb.shotMult++;
                        await alert(`FLUSH MB VALUE INCREASED`, 3000)[1];
                        break;
                    case 'FullHouseMb':
                        if (!this.player.store.FullHouseMb.base)
                            this.player.store.FullHouseMb.base = FullHouseMb.startValue;
                        this.player.store.FullHouseMb.base += FullHouseMb.startValue;
                        await alert(`FULL HOUSE MB VALUE INCREASED`, 3000)[1];
                        break;
                }
            }
        }
        fork(ResetDropBanks(this));
        await gWait(1000, 'showing cards');

        if (this.player.royalFlushReady)
            this.player.royalFlushReady = 'missed';

        let change: number|undefined = undefined;
        switch (result.aHand) {
            case Hand.FourOfAKind:
                change = 50;
                break;
            case Hand.ThreeOfAKind:
                change = 20;
                break;
            case Hand.TwoPair:
                change = 10;
                break;
            case Hand.RoyalFlush:
                // this.player.addScore(1000000, 'royal flush', true);
                if (this.player.royalFlushReady) {
                    this.player.royalFlushReady = false;
                    // this.player.qualifyMb('RoyalFlushMb');
                }
                break;
            // case Hand.Pair:
            //     change = 10;
            //     break;
        }
        if (change) {
            this.player.changeValue(change, false);
            notify(`${HandNames[result.aHand]}: $ VALUE +${comma(change)} -> ${this.player.store.Poker!.cashValue}`, 3000);
        }

        if (this.playerWins) {
            const speed = 30;
            const maxTime = 2000;
            const rate = Math.max(20, round(Math.abs(this.pot)/(maxTime/speed), 10));
            let dropTime = 500;
            let lastDrop = 0;
            let drops = 0;
            let dropCount = 3;
            while (this.pot !== 0) {
                if (this.pot/speed/rate > .300) {
                    lastDrop = time();
                    void playSound('chip drop');
                    if (++drops === dropCount) {
                        dropTime /= 2;
                        drops = 0;
                        dropCount *= 2;
                    }
                }
                const change = Math.min(this.pot, rate) * (this.playerWins? 1:-1) * Math.sign(this.pot);
                this.bank += change;
                this.pot -= Math.abs(change);
                await gWait(speed, 'win count');
            }
        }

        await gWait(750, 'showing cards');

        // void unmuteMusic();
        
        this.end();
    }

    override end() {
        for (const mode of this.newModes)
            this.player.modesQualified.add(mode);

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

    getSkillshot(ss: Skillshot): Partial<SkillshotAward>[] {
        const base = ss.isFirstOfBall? 4 : 10;

        const availSpots = [7, 8, 13, 6, 5, 9, 15, 4].filter(i => this.slots[i]);
        const nSpots = this.step<7? this.skillshotRng.weightedSelect([30, 0], [30, 1], [20, 2], [10, 3]) : 0;
        const spotInds = seq(nSpots).map(() => this.skillshotRng.randRange(0, 5));
        const nBets = !this.player.royalFlushReady? this.skillshotRng.weightedSelect([25, 1], [50, 2], [25, 3]) : 0;
        const betInds = seq(nBets).map(() => this.skillshotRng.randRange(0, 5));

        const switches = ['first switch','second switch','third switch', 'upper lanes','upper eject hole','left inlane'];
        const mults = [
            this.step<=2? [[1, 0]] : [[3, -8, -2], [4, 1, 5], [1, -10, -5]],
            [[3, -10, -4], [1, -10, -6], [4, 3, 10], [2, 10, 20]],
            [[3, -10, -3], [4, 3, 10], [1, 10, 20]],
            [[1, 10, 15], [4, 3, 10], [1, -10, -5]],
            [[1, 10, 20], [4, 3, 10]],
            [[3, -10, -2], [5, 3, 9], [1, 10, 20]],
        ];
        const textSettings: [number, number, 'baseline', number][] = [
            [8, 126, 'baseline', 46],
            [13, 110, 'baseline', 58],
            [7, 109, 'baseline', 48],
            [13, 110, 'baseline', 58],
            [13, 110, 'baseline', 58],
            [7, 109, 'baseline', 48],
        ];
        let betSign = 1;
        return [...switches.map((sw, i) => {
            let award: Partial<SkillshotAward> = {};
            if (spotInds.includes(i)) {
                const slot = availSpots.shift()!;
                const card = this.slots[slot]!;
                const name = Rank[card.num] + " of " + Object.entries(Suit).find(s => s[1] === card.suit)![0];
                award = {
                    award: name,
                    made: () => {
                        Events.fire(new DropDownEvent(machine.dropTargets.find(t => t.num === slot)!));
                    },
                };
            }
            if (betInds.includes(i)) {
                const amount = round(this.bet * this.skillshotRng.randSelect(.4, .5, .6, .7) * betSign, 10, -1000);
                betSign *= -1;
                return {
                    award: 'BET ' + money(amount, 0, '+'),
                    made: () => {
                        this.bet += amount;
                        notify(`BET ${money(amount, 0, '+')}`);
                        Log.log('game', 'skillshot increase bet by %i to %i', amount, this.bet);
                    },
                    dontOverride: true,
                };
            }

            const percent = base * this.skillshotRng.weightedRange(...mults[i] as any);
            let change = round(percent, 10, -1000);
            if (this.bet + change < 0) change = 10;
            const newBet = this.bet + change;
            return {
                ...award,
                switch: sw,
                display: change? dMany(
                    dImage('bet'+(i===1? '_2' : '')),
                    dText(money(change, 0, '+'), ...textSettings[i]),
                ) : undefined,
                collect: () => {
                    this.bet += change;
                    notify(`BET ${money(change, 0, '+')}`);
                    Log.log('game', 'skillshot increase bet by %i to %i', change, this.bet);
                },
            };
        }), { award: 'plunge to adjust bet amount'}];
    }

    snail() {
        if (machine.sShooterLane.state) return;
        if (this.player.chips < 1) return;
        if (this.step <= 2 || this.step>=7)
            return;

        void playSound('snail');

        this.player.removeChip();

        this.pot -= this.bet * 2;
        this.bank += this.bet;

        const removedCard = this.playerHand[this.step-1];
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

export enum Rank {
    Ace = 1,
    Two = 2,
    Three = 3,
    Four = 4,
    Five = 5,
    Six = 6,
    Seven = 7,
    Eight = 8,
    Nine = 9,
    Ten = 10,
    Jack = 11,
    Queen = 12,
    King = 13,
}

export interface Card {
    readonly num: Rank;
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