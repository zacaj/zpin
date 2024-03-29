import { Multiball } from './multiball';
import { addToScreen, alert, gfx, pfx, screen } from '../gfx';
import { fork } from '../promises';
import { DropBank, DropBankCompleteEvent, DropDownEvent, DropTarget } from '../drop-bank';
import { Player, SpinnerRip } from './player';
import { machine, SkillshotAward } from '../machine';
import { State } from '../state';
import { Outputs } from '../outputs';
import { AnimParams } from 'aminogfx-gl';
import { onAnyPfSwitchExcept, onSwitchClose, SwitchEvent } from '../switch-matrix';
import { StraightMbGfx } from '../gfx/straight.mb';
import { light, Color, colorToHex, colorToArrow } from '../light';
import { Priorities, Events } from '../events';
import { comma, and, assert, makeState, repeat, round } from '../util';
import { SkillshotComplete as SkillshotComplete } from './skillshot';
import { Rng } from '../rand';
import { Card } from './poker';
import { Restart } from './restart';
import { dClear, dImage, dInvert } from '../disp';
import { Time, time, wait } from '../timer';
import { playVoice } from '../sound';
import { FlashLights, ShimmerLights } from '../util-modes';


const Starting = makeState('starting', { 
    secondBallLocked: false,
    addABallReady: false,
});
const BankLit = makeState('bankLit', (curBank: DropBank) => ({ curBank}));
const JackpotLit = makeState('jackpotLit', { awardingJp: 0, doubled: undefined as Time|undefined});

function isFirstDown(target: DropTarget): boolean {
    const targetI = target.bank.targets.indexOf(target);
    return target.bank.targets.every((t, i) => t.state || i >=targetI);
}

export class StraightMb extends Multiball {
    readonly bankColors = new Map<DropBank, Color>([
        [machine.centerBank, Color.Orange],
        [machine.upper2Bank, Color.White],
        [machine.rightBank, Color.Yellow],
        [machine.leftBank, Color.Green],
        [machine.upper3Bank, Color.Pink],
    ]);

    state: ReturnType<typeof Starting>|ReturnType<typeof BankLit>|ReturnType<typeof JackpotLit> = Starting();
    
    static startValue = 300000;
    value = StraightMb.startValue;

    skillshotRng!: Rng;
    bankRng!: Rng;
    topTotal = 0;

    jackpots = 0;
    drops = 0;
    lastBank?: DropBank;

    get doubleComboActive() {
        return this.state._ === 'jackpotLit' && this.state.doubled && time()-this.state.doubled<5000;
    }

    nextBank!: DropBank;

    protected constructor(
        player: Player,
        public hand: Card[],
        isRestarted = false,
        public restartBank?: DropBank,
    ) {
        super(player, isRestarted);
        if (machine.ballsLocked !== 'unknown')
            machine.ballsLocked++;
        this.skillshotRng = player.rng();
        this.bankRng = player.rng();
        this.nextBank = restartBank ?? machine.dropBanks[this.bankRng.weightedRand(1, 1, 5, 0, 3, 0)];
        State.declare<StraightMb>(this, ['state']);
        player.storeData<StraightMb>(this, ['value', 'bankRng', 'skillshotRng', 'topTotal']);
        const outs: any  = {};
        for (const target of machine.dropTargets) {
            if (!target.image) continue;
            outs[target.image.name] = () => {
                switch (this.state._) {
                    case 'starting':
                        if (target.bank === this.nextBank)
                            return !target.state? dInvert(time()%500>350 && isFirstDown(target), colorToArrow(this.bankColors.get(this.nextBank))) : undefined;
                        return undefined;
                    case 'bankLit':
                        if (target.bank === this.state.curBank)
                            return !target.state? dInvert(time()%500>350 && isFirstDown(target), colorToArrow(this.bankColors.get(this.state.curBank))) : undefined;
                        return undefined;
                    case 'jackpotLit':
                    default:
                        return undefined;
                }
            };
        }
        this.out = new Outputs(this, {
            ...outs,
            rampUp: () => this.state._==='bankLit' || (this.state._==='starting' && !this.state.addABallReady && (this.state.secondBallLocked || player.ball?.skillshot?.curAward !== 0)),
            lockPost: () => this.lockPost ?? false,
            lRampArrow: () => this.state._ === 'jackpotLit'? [[this.doubleComboActive? Color.Red : Color.Yellow, 'fl', this.doubleComboActive? 7 : 4]] :
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)?  [[Color.Green, 'fl']] : undefined),
            iRamp: () => this.state._==='jackpotLit'? dImage("jackpot") : 
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)? dImage('add_a_ball') : undefined),
            getSkillshot: () => this.state._==='starting'? () => this.getSkillshot() : undefined,
            iSpinner: () => this.state._==='jackpotLit' && !this.state.doubled? dImage('jp_base_25') : undefined,
            iSS1: () => this.state._==='jackpotLit' && !this.state.doubled? dImage('one_shot_double_jp') : undefined,
        });
        if (isRestarted && this.state._==='starting') this.state.secondBallLocked = true;

        this.listen(onSwitchClose(machine.sRampMade), async (e) => {
            if (machine.ballsLocked !== 'unknown')
                machine.ballsLocked++;
            if (this.state._==='starting') {
                if (!this.state.secondBallLocked && !machine.cRamp.actual && this.state.addABallReady) {
                    this.state.secondBallLocked = true;
                    this.state.addABallReady = false;
                    void playVoice('ball added', undefined, true);
                    await alert('ball locked')[1];
                    await this.releaseBallFromTrough();
                }
                else if (this.player.ball?.skillshot)
                    await this.player.ball?.skillshot?.finish(e);
                else
                    await this.releaseBallsFromLock();
            }
            else if (this.state._==='jackpotLit')
                return this.jackpot();
            else
                await this.releaseBallsFromLock();
        });

        this.listen([e => e instanceof SpinnerRip], () => {
            if (this.state._==='jackpotLit' && !this.state.doubled) {
                this.value *= 1.25;
                this.state.doubled = 1 as Time;
            }
        });

        this.listen([...onSwitchClose(machine.sShooterLower)], () => {
            if (this.state._==='jackpotLit' && !this.state.doubled)
                this.state.doubled = time();
        });
        

        this.listen<DropBankCompleteEvent>([
            e => e instanceof DropBankCompleteEvent, e => this.state._==='bankLit' && e.bank === this.state.curBank], 
        () => {
            this.state = JackpotLit();
            // void playVoice('shoot the ramp');
            void playVoice('jackpot is lit');
        });

        this.listen<DropDownEvent>(e => e instanceof DropDownEvent && this.state._==='bankLit' && e.target.bank === this.state.curBank, (e) => {
            this.drops++;
            if (isFirstDown(e.target)) {
                this.value += round(this.value * .15, 50000);
            }
            this.total += 10000;
            this.player.score += 10000;
        });

        this.listen(e => e instanceof SkillshotComplete, () => {
            if (this.state._==='starting' && this.state.addABallReady) return;
            fork(this.releaseBallsFromLock());
            this.selectBank();
        });

        addToScreen(() => new StraightMbGfx(this));
    }

    static async start(player: Player, isRestarted = false, bank?: DropBank, total = 0): Promise<StraightMb|false> {
        const finish = await Events.tryPriority(Priorities.StartMb);
        if (!finish) return false;

        if (!player.curMode) {
            const hand = player.mbsQualified.get('StraightMb') ?? [];
            if (!isRestarted) {
                player.mbsQualified.delete('StraightMb');
            }
            const mb = new StraightMb(player, hand, isRestarted, bank);
            player.focus = mb;
            mb.total = total;
            (mb.gfx as any)?.notInstructions.visible(false);
            void playVoice('straight mb');
            await alert('STRAIGHT Multiball!', 4000)[1];
            (mb.gfx as any)?.notInstructions.visible(true);
            if (!isRestarted) {
                await mb.start();
            }
            await mb.releaseBallFromTrough();
            finish();
            return mb;
        } else {
            finish();
            return false;
        }
    }

    override async lastBallDrained() {       
        const finish = await Events.tryPriority(Priorities.EndMb);
        if (!finish) {
            debugger;
            throw new Error();
        }
        if (this.state._==='starting') {
            await this.releaseBallsFromLock();
        }
        const ret = this.end();
        if (this.jackpots === 0 && !this.isRestarted) {
            this.player.addTemp(new Restart(this.player.ball!, Math.max(25 - this.drops * 4, 9), () => {
                return StraightMb.start(this.player, true, this.lastBank, this.total);
            }));
        }
        if (this.total > this.topTotal)
            this.topTotal = this.total;
        this.total = Math.max(this.total, 1);
        this.player.straightMbStatus += this.total;
        if (this.player.straightMbStatus && this.player.flushMbStatus && this.player.fullHouseMbStatus)
            this.player.royalFlushReady = true;
        finish();
        return ret;
    }
    
    selectBank(bank?: DropBank) {
        if (!bank) {
            bank = this.nextBank;
            do {
                this.nextBank = machine.dropBanks[this.bankRng.weightedRand(1, 1, 5, 0, 3, 0)];
            } while (this.nextBank === this.lastBank);
        }
        this.state = BankLit(bank);
        this.lastBank = bank;
    }

    async jackpot() {
        if (this.state._ !== 'jackpotLit') {
            debugger;
            return;
        }
        this.jackpots++;
        if (this.state.awardingJp) {
            fork(this.releaseBallFromLock());
            void playVoice('rowdy ramp round', 75, true);
        } 
        else
            void playVoice('jackpot excited echo', 75, true);
        this.state.awardingJp++;
        const value = this.value * (this.doubleComboActive? 2 : 1);
        fork(FlashLights(machine.overrides, 1.5, Color.Blue).then(() => ShimmerLights(machine.overrides, 900, Color.Blue)));
        const [group, promise] = alert('JACKPOT!', 4500, comma(value));
        this.player.score += value;
        this.total += value;
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
        this.state.awardingJp--;
        if (this.state.awardingJp === 0) {
            fork(this.releaseBallFromLock());
            if (this.value > 750000)
            //     this.value += round(this.value * .15, 100000);
            // else
                this.value -= round(this.value * .5, 100000);
            this.selectBank();
        }
    }

    
    getSkillshot(): Partial<SkillshotAward>[] {
        const switches = ['first switch','second switch','third switch','upper lanes','upper eject hole','left inlane'];
        // const selections: (string|DropBank)[] = [
        //     'random', 
        //     this.restartBank ?? this.skillshotRng.weightedSelect([8, machine.centerBank], [3, machine.leftBank], [1, machine.upper2Bank]),
        //     this.restartBank ?? this.skillshotRng.weightedSelect([5, machine.centerBank], [5, machine.leftBank],  [1, machine.upper3Bank]),
        //     this.restartBank ?? this.skillshotRng.weightedSelect([4, machine.leftBank], [4, machine.centerBank], [1, machine.upper2Bank]),
        //     this.restartBank ?? this.skillshotRng.weightedSelect([8, machine.centerBank], [5, machine.leftBank], [1, machine.upper2Bank], [1, machine.upper3Bank]),
        //     this.restartBank ?? this.skillshotRng.weightedSelect([5, machine.leftBank], [1, machine.upper3Bank]),
        // ];
        const verb = this.isRestarted? repeat('JACKPOT +50K', 6) : [
            this.state._==='starting'&&this.state.secondBallLocked? 'JACKPOT +50K' : 'ONE-SHOT ADD-A-BALL',
            ...[
                'JACKPOT +250K',
                this.nextBank!==machine.upper2Bank? 'LIGHT 2-BANK' : undefined,
                this.nextBank!==machine.rightBank? 'LIGHT 5-BANK' : undefined,
                this.nextBank!==machine.leftBank? 'LIGHT 4-BANK' : undefined,
                this.nextBank!==machine.centerBank? 'LIGHT 3-BANK' : undefined,
                this.nextBank!==machine.centerBank? 'LIGHT 3-BANK' : undefined,
                undefined,
                undefined,
                'JACKPOT +250K',
            ].shuffle(() => this.skillshotRng.rand()).slice(0, 5),
        ];

        return [...switches.map((sw, i) => {
            return {
                switch: sw,
                award: verb[i],
                dontOverride: !!verb[i],
                made: (e: SwitchEvent) => {
                    switch (verb[i]) {
                        case 'ONE-SHOT ADD-A-BALL': 
                            if (this.state._==='starting' && !this.state.secondBallLocked) {
                                this.state.addABallReady = true; 
                                this.listen(onAnyPfSwitchExcept(), async (ev) => {
                                    if (e === ev || ev.sw === e.sw || ev.sw === machine.sRightInlane) return;
                                    const finish = await Events.tryPriority(Priorities.ReleaseMb);
                                    if (ev.sw !== machine.sRampMade) {
                                        this.selectBank();
                                        await this.releaseBallsFromLock();
                                    }
                                    if (finish) finish();
                                    return 'remove';
                                });
                            }
                        break;
                        case 'JACKPOT +250K': this.value += 250000; break;
                        case 'JACKPOT +50K': this.value += 50000; break;
                        case 'DOUBLE JACKPOT VALUE': this.value *= 2; break;
                        case 'TRIPLE JACKPOT VALUE': this.value *= 3; break;
                        case '1.5X JACKPOT VALUE': this.value *= 1.5; break;
                        case 'LIGHT 2-BANK': this.nextBank = machine.upper2Bank; break;
                        case 'LIGHT 3-BANK': this.nextBank = machine.centerBank; break;
                        case 'LIGHT 4-BANK': this.nextBank = machine.leftBank; break;
                        case 'LIGHT 5-BANK': this.nextBank = machine.rightBank; break;
                        default:
                            break;
                    }
                },
            };
        }), { award: 'plunge to choose bank'}];
    }
}