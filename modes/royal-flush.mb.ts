import { Multiball } from './multiball';
import { addToScreen, alert, gfx, pfx, screen } from '../gfx';
import { fork } from '../promises';
import { DropBank, DropBankCompleteEvent, DropDownEvent, DropTarget } from '../drop-bank';
import { Player, SpinnerHit, SpinnerRip } from './player';
import { machine, SkillshotAward } from '../machine';
import { State } from '../state';
import { Outputs } from '../outputs';
import { AnimParams } from 'aminogfx-gl';
import { onAnyPfSwitchExcept, onSwitchClose, SwitchEvent } from '../switch-matrix';
import { RoyalFlushMbGfx } from '../gfx/royal-flush.mb';
import { light, Color, colorToHex, colorToArrow, flash } from '../light';
import { Priorities, Events } from '../events';
import { comma, and, assert, makeState, repeat, round, score } from '../util';
import { SkillshotComplete as SkillshotComplete } from './skillshot';
import { Rng } from '../rand';
import { Card } from './poker';
import { Restart } from './restart';
import { dClear, dFitText, dFlash, dImage, dInvert } from '../disp';
import { Time, time } from '../timer';
import { playSound, playVoice } from '../sound';
import { BallSaved } from './ball';

const AvgSpins = 25;
const MinJackpot = 500000;
const MaxJackpot = 2000000;
const AvgJackpot = 600000;
const MinAdd = MinJackpot / AvgSpins / 12;
const MaxAdd = (drops: number, total: number) => MaxJackpot * (drops/12) * total / AvgJackpot / drops / AvgSpins;

const Starting = makeState('starting', { 
    secondBallLocked: false,
    addABallReady: false,
});
const BankLit = makeState('bankLit', (curBank: DropBank) => ({ curBank, drops: 0}));
const JackpotLit = makeState('jackpotLit', { spins: 0 });
const SuperLit = makeState('superLit', {  });

export class RoyalFlushMb extends Multiball {
    state: ReturnType<typeof Starting>|ReturnType<typeof BankLit>|ReturnType<typeof JackpotLit>|ReturnType<typeof SuperLit> = Starting();
    
    banks = [machine.rightBank, machine.centerBank, machine.leftBank];

    skillshotRng!: Rng;
    topTotal = 0;
    mult = 1;

    flushTotal = this.player.flushMbStatus;
    straightTotal = this.player.straightMbStatus;
    fullHouseTotal = this.player.fullHouseMbStatus;

    value = 100;
    bankValue: number[];
    superValue = 0;
    ballSave = 30;

    gfx?: RoyalFlushMbGfx;

    static SpinsForSuper = AvgSpins+10;

    protected constructor(
        player: Player,
        public hand: Card[],
        isRestarted = false,
    ) {
        super(player, isRestarted);
        if (machine.ballsLocked !== 'unknown')
            machine.ballsLocked++;
        this.skillshotRng = player.rng();
        State.declare<RoyalFlushMb>(this, ['state', 'value', 'bankValue', 'superValue', 'ballSave']);
        player.storeData<RoyalFlushMb>(this, ['mult', 'skillshotRng', 'topTotal']);
        const outs: any  = {};
        for (const target of machine.dropTargets) {
            if (!target.image) continue;
            if (this.banks.includes(target.bank)) {
                outs[target.image.name] = () => {
                    switch (this.state._) {
                        case 'starting':
                            if (target.bank === machine.rightBank)
                                return dImage('mystery_1');//colorToArrow(Color.White);
                            if (target.bank === machine.centerBank)
                                return dImage('mystery_2');//colorToArrow(Color.White);
                            if (target.bank === machine.leftBank)
                                return dImage('mystery_3');//colorToArrow(Color.White);
                            // if (this.banks.indexOf(target.bank) === this.banks.indexOf(machine.rightBank)+1)
                            //     return colorToArrow(Color.Red);
                            return undefined;
                        case 'bankLit':
                            if (target.bank === this.state.curBank)
                                return !target.state? dInvert(time()%500>350, colorToArrow(Color.White)) : undefined;
                            if (this.banks.indexOf(target.bank) === this.banks.indexOf(this.state.curBank)+1 && this.state.drops>0)
                                return !target.state? colorToArrow(Color.Red) : undefined;
                            return undefined;
                        case 'jackpotLit':
                        default:
                            return undefined;
                    }
                };
            }
        }
        this.out = new Outputs(this, {
            ...outs,
            // rampUp: () => (this.state._==='starting' && !this.state.addABallReady && (this.state.secondBallLocked || player.ball?.skillshot?.curAward !== 0)),
            rampUp: () => this.state._==='superLit',
            lockPost: () => this.lockPost ?? false,
            getSkillshot: () => this.state._==='superLit'? () => this.getSkillshot() : undefined,
            iSpinner: () => this.state._==='superLit'? dImage('stop_h') : this.state._==='jackpotLit' || (this.state._==='bankLit' && this.state.curBank===this.banks.last())? undefined : dClear(Color.Black),
            lSpinnerArrow: () => this.state._==='jackpotLit'? [[Color.White, 'fl', 6]] :
                                 this.state._==='bankLit' && this.state.curBank===this.banks.last()? [[Color.Red, 'pl', 3]] : 
                                 this.state._==='starting'? [[Color.White, 'pl', 4]] : undefined,
            spinnerValue: () => this.state._==='jackpotLit' || (this.state._==='bankLit' && this.state.curBank===this.banks.last())? this.value : undefined,
            catcher: () => this.state._==='superLit',
            // lSideShotArrow: () => flash(this.state._==='superLit', Color.White, 6),
            lRampArrow: () => flash(this.state._==='superLit', Color.White, 6),
            iRamp: () => this.state._==='superLit'? dFlash(dImage('super_skill')) : dClear(Color.Black),
            lShootAgain: () => time() < this.startTime + this.ballSave*1000? [[Color.Green, 'pl']] : [[Color.Red, 'pl']],
            ballSave: true,
            enableSkillshot: () => this.state._==='superLit',
            shooterDiverter: () => this.state._==='superLit' || machine.lastSwitchHit!.lastChange < machine.sShooterLane.lastChange,
            leftGate: true,
            rightGate: true,
        });
        if (isRestarted && this.state._==='starting') this.state.secondBallLocked = true;        

        this.listen<DropBankCompleteEvent>([
            e => e instanceof DropBankCompleteEvent, e => this.state._==='bankLit' && e.bank === this.state.curBank], 
        (e) => {
            if (this.state._ !=='bankLit') return;
            const index = this.banks.indexOf(e.bank);
            if (this.banks.length === index+1) {
                this.state = JackpotLit();
                // void playVoice('shoot the ramp');
                void playVoice('jackpot is lit');
            }
            else {
                this.state = BankLit(this.banks[index+1]);
            }
        });

        this.listen<DropDownEvent>(e => e instanceof DropDownEvent, (e) => {
            this.total += 1000;
            this.player.score += 1000;
            if (this.state._ !== 'bankLit') return;
            if (this.state.curBank === e.target.bank || (this.banks.last()!==this.state.curBank && this.banks[this.banks.indexOf(this.state.curBank)+1]===e.target.bank && this.state.drops>0)) {
                void playSound('clunk '+'abcdef'.charAt(this.state.drops));
                this.state.drops++;
                const add = this.bankValue[this.banks.indexOf(e.target.bank)];
                this.player.addScore(round(add * 0.05, 10), 'royal drop', false);
                this.total += round(add * 0.05, 10);
                this.value += add;
                if (this.state.curBank !== e.target.bank) 
                    this.state = BankLit(e.target.bank);
                    this.state.drops++;
            }
        });

        this.listen(onSwitchClose(machine.sSpinner), () => {
            if (this.state._!=='jackpotLit' && this.state._!=='superLit' &&  (this.state._!=='bankLit' || this.state.curBank!==this.banks.last())) return;
            if (this.state._==='bankLit')
                this.state = JackpotLit();
            // this.player.addScore(this.value, 'royal jp', false);
            void playSound('jackpot excited echo_1', undefined, true);
            this.superValue += this.value;
            this.total += this.value;
            if (this.state._==='jackpotLit') {
                this.state.spins++;
                if (this.state.spins >= RoyalFlushMb.SpinsForSuper) {
                    this.state = SuperLit();
                }
            }
        });

        // this.listen([...onSwitchClose(machine.sUpperEject)], () => {
        //     if (machine.sUpperInlane.wasClosedWithin(1500) && this.state._==='superLit') {
        //         this.total += this.superValue;
        //         player.addScore(this.superValue, 'royal super', true);
                
        //         const [group, promise] = alert('SUPER JACKPOT!', 4500, comma(this.value!));
        //         const anim: AnimParams = {
        //             from: 1,
        //             to: 2,
        //             duration: 350,
        //             loop: 4,
        //             timeFunc: 'linear',
        //         };
        //         group.sx.anim(anim).start();
        //         group.sy.anim(anim).start();
        //     }
        // });

        this.bankValue = [this.player.flushMbStatus, this.player.fullHouseMbStatus, this.player.straightMbStatus]
            .map((total, i) => round(Math.max(MinAdd, MaxAdd(this.banks[i].targets.length, total))*this.mult, 100));
        // this.player.fullHouseMbStatus = 0;
        // this.player.flushMbStatus = 0;
        // this.player.straightMbStatus = 0;
        this.ballSave += player.store.Poker.handsWon * 7;

        addToScreen(() => new RoyalFlushMbGfx(this));
    }

    static async start(player: Player, isRestarted = false, total = 0): Promise<RoyalFlushMb|false> {
        const finish = await Events.tryPriority(Priorities.StartMb);
        if (!finish) return false;

        if (!player.curMode) {
            const hand = player.mbsQualified.get('RoyalFlushMb') ?? [];
            if (!isRestarted) {
                player.mbsQualified.delete('RoyalFlushMb');
            }
            const mb = new RoyalFlushMb(player, hand, isRestarted);
            player.focus = mb;
            mb.total = total;
            // (mb.gfx as any)?.notInstructions.visible(false);
            // void playVoice('royalflush mb');
            await alert('ROYAL FLUSH!', 4000)[1];
            // todo voice
            // (mb.gfx as any)?.notInstructions.visible(true);
            if (!isRestarted) {
                await mb.start();
            }
            await mb.gfx?.ready;
            // await mb.releaseBallFromTrough();
            mb.state = BankLit(mb.banks[0]);
            await mb.releaseBallFromLock();
            mb.startTime = time();
            finish();
            return mb;
        } else {
            finish();
            return false;
        }
    }

    async lastBallDrained() {       
        const finish = await Events.tryPriority(Priorities.EndMb);
        if (!finish) {
            debugger;
            throw new Error();
        }
        if (this.state._==='starting') {
            await this.releaseBallsFromLock();
        }
        const ret = this.end();
        // if (this.jackpots === 0 && !this.isRestarted) {
        //     this.player.noMode?.addTemp(new Restart(this.player.ball!, Math.max(25 - this.drops * 4, 9), () => {
        //         return RoyalFlushMb.start(this.player, true, this.lastBank, this.total);
        //     }));
        // }
        finish();
        return ret;
    }

    end() {
        if (this.total > this.topTotal)
            this.topTotal = this.total;
        this.player.straightMbStatus = this.player.flushMbStatus = this.player.fullHouseMbStatus = 0;
        return super.end();
    }

    async ballDrained() {
        if (machine.lastSwitchHit!.lastChange < this.startTime + this.ballSave*1000) {
            let value: number;
            if (this.state._==='bankLit') {
                value = round(this.value * .1, 10);
                this.value -= value;
            }
            else {
                value = round(this.superValue * .1, 10);
                this.superValue -= value;
            }
            alert('BALL SAVED', 3000, value? `${score(value)} VALUE LOST` : undefined);
            // todo voice
        }
        else {
            void playVoice("crowd groan");
            fork(this.await(e => e instanceof BallSaved).then(() => this.end()));
        }
        return undefined;
    }

    async superJackpot() {
        this.total += this.superValue;
        this.player.addScore(this.superValue, 'royal super', false);
        
        // todo voice
        const [group, promise] = alert('SUPER JACKPOT!', 5500, score(this.superValue!));
        const anim: AnimParams = {
            from: 1,
            to: 2,
            duration: 350,
            loop: 4,
            timeFunc: 'linear',
        };
        group.sx.anim(anim).start();
        group.sy.anim(anim).start();
        await promise;
        return this.end();
    }
    
    getSkillshot(): Partial<SkillshotAward>[] {
        const switches = ['first switch','second switch','third switch','upper lanes','upper eject hole','left inlane'];
        // const verb = this.isRestarted? repeat(undefined, 6) : [
        //     this.state._==='starting'&&this.state.secondBallLocked? undefined : 'ONE-SHOT ADD-A-BALL',
        //     ...[
        //         '2X LEFT BANK',
        //         '2X RIGHT BANK',
        //         '2X CENTER BANK',
        //         undefined,
        //         undefined,
        //     ].shuffle(() => this.skillshotRng.rand()),
        // ];
        const min = Math.min(...this.player.store.Skillshot.timesTried);
        const verb = (this.player.store.Skillshot.timesTried as number[]).map((times) => times === min? 'SUPER JACKPOT' : undefined);
        while (verb.filter(x => x === 'SUPER JACKPOT').length < 2)
            verb[this.skillshotRng.randRange(0, 5)] = 'SUPER JACKPOT';

        void playVoice('super skill');

        return [...switches.map((sw, i) => {
            return {
                switch: sw,
                award: verb[i],
                // dontOverride: i===0,
                dontOverride: verb[i]==='SUPER JACKPOT',
                collect: () => {
                    // if (this.state._==='starting' && this.state.addABallReady) return;
                    // fork(this.releaseBallsFromLock());
                    if (verb[i] !== 'SUPER JACKPOT') {
                        void playVoice("crowd groan");
                        return this.end();
                    }
                },
                made: (e: SwitchEvent) => {
                    switch (verb[i]) {
                        // case 'ONE-SHOT ADD-A-BALL': 
                        //     if (this.state._==='starting' && !this.state.secondBallLocked) {
                        //         this.state.addABallReady = true; 
                        //         this.listen(onAnyPfSwitchExcept(), (ev) => {
                        //             if (e === ev || ev.sw === e.sw || ev.sw === machine.sRightInlane) return;
                        //             if (ev.sw !== machine.sRampMade) {
                        //                 fork(this.releaseBallsFromLock());
                        //             }
                        //             return 'remove';
                        //         });
                        //     }
                        // break;
                        // case '2X LEFT BANK': this.bankValue[2] *= 2; break;
                        // case '2X RIGHT BANK': this.bankValue[0] *= 2; break;
                        // case '2X CENTER BANK': this.bankValue[1] *= 2; break;
                        case 'SUPER JACKPOT': 
                            // fork(this.superJackpot().then(() => this.end()));
                            fork(this.superJackpot());
                            break;
                        default:
                            return;
                    }
                },
            };
        })];
    }
}