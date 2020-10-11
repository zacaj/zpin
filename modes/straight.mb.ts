import { Multiball } from './multiball';
import { addToScreen, alert, gfx, pfx, screen } from '../gfx';
import { fork } from '../promises';
import { DropBank, DropBankCompleteEvent, DropDownEvent } from '../drop-bank';
import { Player } from './player';
import { machine, SkillshotAward } from '../machine';
import { State } from '../state';
import { Outputs } from '../outputs';
import { AnimParams } from 'aminogfx-gl';
import { onAnyPfSwitchExcept, onSwitchClose, SwitchEvent } from '../switch-matrix';
import { StraightMbGfx } from '../gfx/straight.mb';
import { light, Color, colorToHex, colorToArrow } from '../light';
import { Priorities, Events } from '../events';
import { comma, and, assert, makeState, repeat } from '../util';
import { SkillshotEomplete as SkillshotComplete } from './skillshot';
import { Rng } from '../rand';
import { Card } from './poker';
import { Restart } from './restart';


const Starting = makeState('starting', { 
    secondBallLocked: false,
    addABallReady: false,
});
const BankLit = makeState('bankLit', (curBank: DropBank) => ({ curBank}));
const JackpotLit = makeState('jackpotLit', { awardingJp: 0});

export class StraightMb extends Multiball {
    readonly bankColors = new Map<DropBank, Color>([
        [machine.centerBank, Color.Red],
        [machine.upper2Bank, Color.Orange],
        [machine.rightBank, Color.Yellow],
        [machine.leftBank, Color.Green],
        [machine.upper3Bank, Color.Blue],
    ]);

    state: ReturnType<typeof Starting>|ReturnType<typeof BankLit>|ReturnType<typeof JackpotLit> = Starting();

    value = 500000;

    skillshotRng!: Rng;
    bankRng!: Rng;

    jackpots = 0;
    drops = 0;
    lastBank?: DropBank;

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
        player.storeData<StraightMb>(this, ['value', 'bankRng', 'skillshotRng']);
        const outs: any  = {};
        for (const target of machine.dropTargets) {
            outs[target.image.name] = () => {
                switch (this.state._) {
                    case 'starting':
                        return colorToArrow(this.bankColors.get(target.bank));
                    case 'bankLit':
                        if (target.bank === this.state.curBank)
                            return colorToArrow(this.bankColors.get(this.state.curBank));
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
            lRampArrow: () => this.state._ === 'jackpotLit'? Color.Red :
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)?  [[Color.Green, 'fl']] : undefined),
            getSkillshot: () => () => this.getSkillshot(),
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

        this.listen<DropBankCompleteEvent>([
            e => e instanceof DropBankCompleteEvent, e => this.state._==='bankLit' && e.bank === this.state.curBank], 
        () => this.state = JackpotLit());

        this.listen<DropDownEvent>(e => e instanceof DropDownEvent && this.state._==='bankLit' && e.target.bank === this.state.curBank, () => this.drops++);

        addToScreen(() => new StraightMbGfx(this));
    }

    static async start(player: Player, isRestarted = false, bank?: DropBank): Promise<StraightMb|false> {
        const finish = await Events.tryPriority(Priorities.StartMb);
        if (!finish) return false;

        if (!player.curMode) {
            const hand = player.mbsQualified.get('StraightMb') ?? [];
            if (!isRestarted) {
                player.mbsQualified.delete('StraightMb');
                player.mbsQualified.delete('FlushMb');
            }
            const mb = new StraightMb(player, hand, isRestarted, bank);
            player.focus = mb;
            mb.gfx?.visible(false);
            await alert('Multiball!', 3000)[1];
            mb.gfx?.visible(true);
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
            this.player.noMode?.addTemp(new Restart(this.player.ball!, Math.max(20 - this.drops * 4, 6), () => {
                return StraightMb.start(this.player, true, this.lastBank);
            }));
        }
        finish();
        return ret;
    }
    
    selectBank(bank?: DropBank) {
        if (!bank) {
            const i = this.bankRng.weightedRand(1, 1, 5, 0, 3, 3);
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
        if (this.state.awardingJp)
            fork(this.releaseBallFromLock());
        this.state.awardingJp++;
        const [group, promise] = alert('JACKPOT!', 4500, comma(this.value));
        this.player.score += this.value;
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
            this.restartBank ?? this.skillshotRng.weightedSelect([5, machine.centerBank], [3, machine.leftBank]),
            this.restartBank ?? this.skillshotRng.weightedSelect([2, machine.centerBank], [5, machine.leftBank], [2, machine.rightBank]),
            this.restartBank ?? this.skillshotRng.weightedSelect([4, machine.leftBank], [3, machine.rightBank], [1, machine.centerBank]),
            this.restartBank ?? this.skillshotRng.weightedSelect([5, machine.centerBank], [5, machine.leftBank]),
            this.restartBank ?? this.skillshotRng.weightedSelect([5, machine.leftBank]),
        ];
        const verb = this.isRestarted? repeat('ADD 50K TO JACKPOT VALUE', 6) : [
            this.state._==='starting'&&this.state.secondBallLocked? 'ADD 50K TO JACKPOT VALUE' : 'ONE-SHOT ADD-A-BALL',
            'DOUBLE JACKPOT VALUE',
            'DOUBLE JACKPOT VALUE',
            '1.5X JACKPOT VALUE',
            'TRIPLE JACKPOT VALUE',
            'ADD 250K TO JACKPOT VALUE',
        ];

        return [...switches.map((sw, i) => {
            return {
                switch: sw,
                award: verb[i],
                dontOverride: i===0,
                display: typeof selections[i] === 'string'? selections[i] as string
                    : pfx?.createRect().h(80).w(160).fill(colorToHex(this.bankColors.get(selections[i] as DropBank)!)!) ?? {fill() { }} as any,
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
                        case 'ADD 250K TO JACKPOT VALUE': this.value += 250000; break;
                        case 'ADD 50K TO JACKPOT VALUE': this.value += 50000; break;
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