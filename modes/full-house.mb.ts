import { AnimParams } from 'aminogfx-gl';
import { Events, Priorities } from '../events';
import { addToScreen, alert, pfx } from '../gfx';
import { FullHouseMbGfx } from '../gfx/full-house.mb';
import { Color, colorToArrow, colorToHex, flash } from '../light';
import { machine, SkillshotAward } from '../machine';
import { Outputs } from '../outputs';
import { fork } from '../promises';
import { Rng } from '../rand';
import { State } from '../state';
import { onAnyPfSwitchExcept, onSwitchClose, SwitchEvent } from '../switch-matrix';
import { comma, makeState, repeat } from '../util';
import { ResetBank } from '../util-modes';
import { Multiball } from './multiball';
import { Player } from './player';
import { Card } from './poker';
import { Restart } from './restart';

export enum Jackpot {
    RightLane = 'RightLane',
    RightTarget = 'RightTarget',
}

const Starting = makeState('starting', { 
    secondBallLocked: false,
    addABallReady: false,
});
const Started = makeState('started', {});
const JackpotLit = makeState('jackpotLit', (jp: Jackpot) => ({ jp }));

export class FullHouseMb extends Multiball {

    state: ReturnType<typeof Starting>|ReturnType<typeof Started>|ReturnType<typeof JackpotLit> = Starting();

    skillshotRng!: Rng;
    jpRng!: Rng;

    jackpots = 0;

    get value(): number|undefined {
        if (this.state._ !== 'jackpotLit') return undefined;
        switch (this.state.jp) {
            case Jackpot.RightLane:
                if (machine.upper3Bank.targets[2].state)
                    return 750000+this.base;
                else
                    return 1250000+this.base;
            case Jackpot.RightTarget:
                return 1500000+this.base;
            default:
                throw new Error();
        }
    }

    base = 0;

    jpColor(jp?: Jackpot): Color {
        if (this.state._ !== 'jackpotLit' && !jp) return Color.Red;
        switch (jp ?? (this.state as any).jp) {
            case Jackpot.RightLane:
                return Color.Yellow;
            case Jackpot.RightTarget:
                return Color.Orange;
            default: return Color.Red;
        }
    }

    protected constructor(
        player: Player,
        public hand: Card[],
        isRestarted = false,
        public restartJp?: Jackpot,
    ) {
        super(player, isRestarted);
        if (machine.ballsLocked !== 'unknown')
            machine.ballsLocked++;
        this.skillshotRng = player.rng();
        this.jpRng = player.rng();
        State.declare<FullHouseMb>(this, ['state']);
        player.storeData<FullHouseMb>(this, ['jpRng', 'skillshotRng', 'base']);
        this.out = new Outputs(this, {
            rampUp: () => (this.state._==='starting' && !this.state.addABallReady && (this.state.secondBallLocked || player.ball?.skillshot?.curAward !== 0)),
            lockPost: () => this.lockPost ?? false,
            lRampArrow: () => this.state._ === 'started'? [[Color.White, 'fl']] :
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)?  [[Color.Green, 'fl']] : []),
            getSkillshot: () => () => this.getSkillshot(),
            lUpperLaneArrow: () => flash(this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.RightLane), this.jpColor(Jackpot.RightLane)),
            lUpperTargetArrow: () => flash(this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.RightTarget), this.jpColor(Jackpot.RightTarget)),
            iUpper33: () => this.state._==='jackpotLit' && this.state.jp===Jackpot.RightLane && !machine.upper3Bank.targets[2].state? colorToArrow(Color.Red) : undefined,
            rightGate: true,
            leftGate: true,
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
            else {
                if (this.state._ === 'started') {
                    this.state = JackpotLit(this.jpRng.weightedSelect([4, Jackpot.RightLane], [3, Jackpot.RightTarget]));
                    if (this.state.jp === Jackpot.RightLane)
                        fork(ResetBank(this, machine.upper3Bank));
                }
                await this.releaseBallsFromLock();
            }
        });

        this.listen([...onSwitchClose(machine.sBackLane), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.RightLane], 'jackpot');
        this.listen([...onSwitchClose(machine.sSidePopMini), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.RightTarget], 'jackpot');

        addToScreen(() => new FullHouseMbGfx(this));
    }

    static async start(player: Player, isRestarted = false, jp?: Jackpot): Promise<FullHouseMb|false> {
        const finish = await Events.tryPriority(Priorities.StartMb);
        if (!finish) return false;

        if (!player.curMode) {
            const hand = player.mbsQualified.get('FullHouseMb') ?? [];
            if (!isRestarted) {
                player.mbsQualified.delete('FullHouseMb');
            }
            const mb = new FullHouseMb(player, hand, isRestarted, jp);
            player.focus = mb;
            mb.gfx?.visible(false);
            await alert('Full House Multiball!', 3000)[1];
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
            this.player.noMode?.addTemp(new Restart(this.player.ball!, 14, () => {
                return FullHouseMb.start(this.player, true, this.state._==='jackpotLit'? this.state.jp : undefined);
            }));
        }
        finish();
        return ret;
    }

    async jackpot() {
        if (this.state._ !== 'jackpotLit') {
            debugger;
            return;
        }
        this.jackpots++;

        const [group, promise] = alert('JACKPOT!', 4500, comma(this.value!));
        this.player.score += this.value!;
        const anim: AnimParams = {
            from: 1,
            to: 2,
            duration: 350,
            loop: 4,
            timeFunc: 'linear',
        };
        group.sx.anim(anim).start();
        group.sy.anim(anim).start();
        this.base += 250000;
        this.state = Started();
    }

    
    getSkillshot(): Partial<SkillshotAward>[] {
        const switches = ['first switch','second switch','third switch','upper lanes','upper eject hole','left inlane'];
        const selections: (string|Jackpot|undefined)[] = [
            'random', 
            this.restartJp ?? this.skillshotRng.weightedSelect([5, Jackpot.RightLane], [3, Jackpot.RightTarget], [8, undefined]),
            this.restartJp ?? this.skillshotRng.weightedSelect([2, Jackpot.RightLane], [7, undefined], [5, Jackpot.RightTarget]),
            this.restartJp ?? this.skillshotRng.weightedSelect([4, Jackpot.RightLane], [3, Jackpot.RightTarget], [7, undefined]),
            this.restartJp ?? this.skillshotRng.weightedSelect([5, Jackpot.RightLane], [5, Jackpot.RightTarget], [8, undefined]),
            this.restartJp ?? this.skillshotRng.weightedSelect([5, Jackpot.RightLane], [7, undefined]),
        ];
        const verb = this.isRestarted? repeat('10K POINTS', 6) : [
            this.state._==='starting'&&this.state.secondBallLocked? '10K POINTS' : 'ONE-SHOT ADD-A-BALL',
            this.skillshotRng.weightedSelect([3, '100K points'], [3, 'ADD 250K TO JACKPOT VALUE']),
            this.skillshotRng.weightedSelect([3, '100K points'], [3, 'ADD 250K TO JACKPOT VALUE']),
            this.skillshotRng.weightedSelect([3, '100K points'], [3, 'ADD 250K TO JACKPOT VALUE']),
            this.skillshotRng.weightedSelect([3, '100K points'], [3, 'ADD 250K TO JACKPOT VALUE']),
            this.skillshotRng.weightedSelect([3, '100K points'], [3, 'ADD 250K TO JACKPOT VALUE']),
        ];

        return [...switches.map((sw, i) => {
            return {
                switch: sw,
                award: verb[i],
                dontOverride: i===0,
                display: !selections[i]? undefined : (selections[i] === 'random'? selections[i] as string
                    : pfx?.createRect().h(80).w(160).fill(colorToHex(this.jpColor(selections[i] as Jackpot)!)!) ?? {fill() { }} as any),
                collect: () => {
                    if (this.state._==='starting' && this.state.addABallReady) return;
                    if (!selections[i])
                        this.state = Started();
                    else
                        this.state = JackpotLit(selections[i]==='random'? 
                            this.skillshotRng.randSelect(...Object.values(Jackpot))  : (selections[i] as Jackpot));
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
                                        this.state = Started();
                                        fork(this.releaseBallsFromLock());
                                    }
                                    return 'remove';
                                });
                            }
                        break;
                        case 'ADD 250K TO JACKPOT VALUE': this.base += 250000; break;
                        case '100K points': this.player.score += 100000; break;
                        case '10K points': this.player.score += 10000; break;
                        default:
                            debugger;
                    }
                },
            };
        }), { award: 'color lights matching jackpot'}];
    }
}