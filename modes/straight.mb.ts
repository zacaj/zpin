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
import { dClear, dImage } from '../disp';
import { Time, time } from '../timer';
import { playVoice } from '../sound';


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
        [machine.upper2Bank, Color.Purple],
        [machine.rightBank, Color.Yellow],
        [machine.leftBank, Color.Green],
        [machine.upper3Bank, Color.Blue],
    ]);

    state: ReturnType<typeof Starting>|ReturnType<typeof BankLit>|ReturnType<typeof JackpotLit> = Starting();

    value = 500000;

    skillshotRng!: Rng;
    bankRng!: Rng;
    topTotal = 0;

    jackpots = 0;
    drops = 0;
    lastBank?: DropBank;

    total = 0;

    get doubleComboActive() {
        return this.state._ === 'jackpotLit' && this.state.doubled && time()-this.state.doubled<5000;
    }

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
        State.declare<StraightMb>(this, ['state']);
        player.storeData<StraightMb>(this, ['value', 'bankRng', 'skillshotRng', 'topTotal']);
        const outs: any  = {};
        for (const target of machine.dropTargets) {
            if (!target.image) continue;
            outs[target.image.name] = () => {
                switch (this.state._) {
                    case 'starting':
                        return colorToArrow(this.bankColors.get(target.bank));
                    case 'bankLit':
                        if (target.bank === this.state.curBank)
                            return (((time()/500%2)|0)===0 || !isFirstDown(target)) && !target.state? colorToArrow(this.bankColors.get(this.state.curBank)) : undefined;
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

        this.listen(onSwitchClose(machine.sRampMade), async () => {
            if (machine.ballsLocked !== 'unknown')
                machine.ballsLocked++;
            if (this.state._==='starting' && !this.state.secondBallLocked) {
                this.state.secondBallLocked = true;
                this.state.addABallReady = false;
                await alert('ball locked')[1];
                await this.releaseBallFromTrough();
            }
            else
                return this.jackpot();
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
            void playVoice('shoot the ramp');
        });

        this.listen<DropDownEvent>(e => e instanceof DropDownEvent && this.state._==='bankLit' && e.target.bank === this.state.curBank, (e) => {
            this.drops++;
            if (isFirstDown(e.target)) {
                this.value += round(this.value * .15, 50000);
            }
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
            await alert('STRAIGHT Multiball!', 3000)[1];
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
        if (this.jackpots === 0 && !this.isRestarted) {
            this.player.noMode?.addTemp(new Restart(this.player.ball!, Math.max(25 - this.drops * 4, 9), () => {
                return StraightMb.start(this.player, true, this.lastBank);
            }));
        }
        if (this.total > this.topTotal)
            this.topTotal = this.total;
        finish();
        return ret;
    }
    
    selectBank(bank?: DropBank) {
        if (!bank) {
            const i = this.bankRng.weightedRand(1, 1, 5, 0, 3, 0);
            bank = machine.dropBanks[i];
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
            void playVoice('rowdy ramp round');
        } 
        else
            void playVoice('jackpot excited echo');
        this.state.awardingJp++;
        const value = this.value * (this.doubleComboActive? 2 : 1);
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
            this.value += 250000;
            this.selectBank();
        }
    }

    
    getSkillshot(): Partial<SkillshotAward>[] {
        const switches = ['first switch','second switch','third switch','upper lanes','upper eject hole','left inlane'];
        const selections: (string|DropBank)[] = [
            'random', 
            this.restartBank ?? this.skillshotRng.weightedSelect([8, machine.centerBank], [3, machine.leftBank], [1, machine.upper2Bank]),
            this.restartBank ?? this.skillshotRng.weightedSelect([5, machine.centerBank], [5, machine.leftBank],  [1, machine.upper3Bank]),
            this.restartBank ?? this.skillshotRng.weightedSelect([4, machine.leftBank], [4, machine.centerBank], [1, machine.upper2Bank]),
            this.restartBank ?? this.skillshotRng.weightedSelect([8, machine.centerBank], [5, machine.leftBank], [1, machine.upper2Bank], [1, machine.upper3Bank]),
            this.restartBank ?? this.skillshotRng.weightedSelect([5, machine.leftBank], [1, machine.upper3Bank]),
        ];
        const verb = this.isRestarted? repeat('JACKPOT +50K', 6) : [
            this.state._==='starting'&&this.state.secondBallLocked? 'JACKPOT +50K' : 'ONE-SHOT ADD-A-BALL',
            'DOUBLE JACKPOT VALUE',
            'DOUBLE JACKPOT VALUE',
            '1.5X JACKPOT VALUE',
            'TRIPLE JACKPOT VALUE',
            'JACKPOT +250K',
        ];

        return [...switches.map((sw, i) => {
            return {
                switch: sw,
                award: verb[i],
                dontOverride: i===0,
                display: selections[i] === 'random'? dImage("random_bank")
                    : dClear(this.bankColors.get(selections[i] as DropBank)!),
                collect: () => {
                    if (this.state._==='starting' && this.state.addABallReady) return;
                    this.selectBank(selections[i]==='random'? undefined  : (selections[i] as DropBank));
                    fork(this.releaseBallsFromLock());
                },
                made: (e: SwitchEvent) => {
                    switch (verb[i]) {
                        case 'ONE-SHOT ADD-A-BALL': 
                            if (this.state._==='starting') {
                                this.state.addABallReady = true; 
                                this.listen(onAnyPfSwitchExcept(), (ev) => {
                                    if (e === ev || (ev.sw === e.sw && ev.when - e.when < 3000)) return;
                                    if (ev.sw !== machine.sRampMade) {
                                        this.selectBank(undefined);
                                        fork(this.releaseBallsFromLock());
                                    }
                                    return 'remove';
                                });
                            }
                        break;
                        case 'JACKPOT +250K': this.value += 250000; break;
                        case 'JACKPOT +50K': this.value += 50000; break;
                        case 'DOUBLE JACKPOT VALUE': this.value *= 2; break;
                        case 'TRIPLE JACKPOT VALUE': this.value *= 3; break;
                        case '1.5X JACKPOT VALUE': this.value *= 1.5; break;
                        default:
                            debugger;
                    }
                },
            };
        }), { award: 'plunge to choose bank'}];
    }
}