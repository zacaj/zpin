import { AnimParams } from 'aminogfx-gl';
import { dClear, dImage, dMany } from '../disp';
import { Events, Priorities } from '../events';
import { addToScreen, alert, pfx } from '../gfx';
import { FullHouseMbGfx } from '../gfx/full-house.mb';
import { Color, colorToArrow, colorToHex, flash } from '../light';
import { machine, SkillshotAward } from '../machine';
import { Outputs } from '../outputs';
import { fork } from '../promises';
import { Rng } from '../rand';
import { playVoice } from '../sound';
import { State } from '../state';
import { onAnyPfSwitchExcept, onAnySwitchClose, onSwitchClose, SwitchEvent } from '../switch-matrix';
import { time } from '../timer';
import { comma, makeState, repeat } from '../util';
import { ResetBank } from '../util-modes';
import { Multiball } from './multiball';
import { Player, SpinnerHit, SpinnerRip } from './player';
import { Card } from './poker';
import { Restart } from './restart';

export enum Jackpot {
    Drop1 = 'Drop1',
    Drop2 = 'Drop2',
    Drop3 = 'Drop3',
    RightLane = 'RightLane',
    RightTarget = 'RightTarget',
    LeftLane = 'LeftLane',
    LeftTarget = 'LeftTarget',
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

    lastJp?: Jackpot;

    get value(): number|undefined {
        if (this.state._ !== 'jackpotLit') return undefined;
        switch (this.state.jp) {
            case Jackpot.RightLane:
                if (machine.upper3Bank.targets[2].state)
                    return 300000+this.base;
                else
                    return 600000+this.base;
            case Jackpot.RightTarget:
                return 750000+this.base;
            case Jackpot.LeftLane:
                return 600000+this.base;
            case Jackpot.LeftTarget:
                return 500000+this.base;
            case Jackpot.Drop1:
            case Jackpot.Drop2:
            case Jackpot.Drop3:
                return 200000+this.base;
            default:
                throw new Error();
        }
    }

    base = 0;

    jpColor(jp?: Jackpot): Color {
        // if (this.state._ !== 'jackpotLit' && !jp) return Color.Pink;
        switch (jp ?? (this.state as any).jp) {
            case Jackpot.RightLane:
                return Color.Orange;
            case Jackpot.RightTarget:
                return Color.Pink;
            case Jackpot.LeftLane:
                return Color.Purple;
            case Jackpot.LeftTarget:
                return Color.Blue;
            case Jackpot.Drop1: 
            case Jackpot.Drop2: 
            case Jackpot.Drop3: 
                return Color.Yellow;
            default: return Color.Red;
        }
    }

    magnetOnUntil = 0;

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
        State.declare<FullHouseMb>(this, ['state', 'magnetOnUntil']);
        player.storeData<FullHouseMb>(this, ['jpRng', 'skillshotRng', 'base']);
        this.out = new Outputs(this, {
            rampUp: () => (this.state._==='starting' && !this.state.addABallReady && (this.state.secondBallLocked || player.ball?.skillshot?.curAward !== 0)),
            lockPost: () => this.lockPost ?? false,
            lRampArrow: () => this.state._ === 'started'? [[Color.White, 'fl']] : this.state._==='jackpotLit'? [Color.Gray] :
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)?  [[Color.Green, 'fl']] : []),
            iRamp: () => (this.state._==='started' || (this.state._==='jackpotLit' && !this.state.jp.startsWith('Left')))? dImage('light_left_jackpot') : 
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)? dImage('add_a_ball') : undefined),
            lEjectArrow: () => this.state._ === 'started'? [[Color.White, 'fl']] : this.state._==='jackpotLit'? [Color.Gray] : [],
            iSS5: () => this.state._ === 'started' || (this.state._==='jackpotLit'&&this.state.jp.startsWith('Left'))? dImage('light_right_jackpot') : undefined,
            getSkillshot: () => this.state._==='starting'? () => this.getSkillshot() : undefined,
            lUpperLaneArrow: () => flash(this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.RightLane), this.jpColor(Jackpot.RightLane)),
            lUpperTargetArrow: () => flash(this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.RightTarget), this.jpColor(Jackpot.RightTarget)),
            lSideTargetArrow: () => flash(this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.LeftTarget), this.jpColor(Jackpot.LeftTarget)),
            lSideShotArrow: () => flash(this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.LeftLane), this.jpColor(Jackpot.LeftLane)),
            iUpper31: () => ((time()/300%2)|0)===0 && (this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop1))? colorToArrow(this.jpColor(Jackpot.Drop1)) : undefined,
            iUpper32: () => ((time()/300%2)|0)===0 && (this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop2))? colorToArrow(this.jpColor(Jackpot.Drop2)) : undefined,
            iUpper33: () => ((time()/300%2)|0)===0 && (this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop3))? colorToArrow(this.jpColor(Jackpot.Drop2)) : 
                        (this.state._==='jackpotLit' && this.state.jp===Jackpot.RightLane && !machine.upper3Bank.targets[2].state)? dImage('x') : undefined,
            rightGate: true,
            leftGate: true,
            // magnetPost: () => (machine.sShooterUpper.wasClosedWithin(1000) || 
            //         (machine.sLeftOrbit.wasClosedWithin(2000) && !machine.sShooterUpper.wasClosedWithin(1000) && machine.cRightGate.actual))
            //         && !machine.sShooterLower.wasClosedWithin(750),
            upperMagnet: () => time()<this.magnetOnUntil,
            iSpinner: () =>  this.state._==='jackpotLit' && this.state.jp.startsWith('Left')? dImage('activate_magnet') : undefined,
        });
        if (isRestarted && this.state._==='starting') this.state.secondBallLocked = true;

        machine.upper2Bank.targets.forEach(t => this.misc?.targets.delete(t));
        machine.upper3Bank.targets.forEach(t => this.misc?.targets.delete(t));
        this.misc?.targets.clear();

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
                this.state = JackpotLit(this.jpRng.randSelect(...Object.values(Jackpot).filter(j => j.startsWith('Left')) as Jackpot[]));
                await this.releaseBallsFromLock();
            }
        });
        this.listen([...onSwitchClose(machine.sUpperEject)], () => {
            if (machine.sUpperInlane.wasClosedWithin(1500) && this.state._==='jackpotLit' && this.state.jp===Jackpot.LeftLane) {
                return this.jackpot();
            } else {
                if (this.state._ !== 'jackpotLit' || this.state.jp.startsWith('Left'))
                    this.state = JackpotLit(this.jpRng.randSelect(...Object.values(Jackpot).filter(j => !j.startsWith('Left')) as Jackpot[]));
                if (this.state.jp !== Jackpot.RightTarget)
                    fork(ResetBank(this, machine.upper3Bank));
            }
        });

        this.listen([...onSwitchClose(machine.sBackLane), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.RightLane], 'jackpot');
        this.listen([...onSwitchClose(machine.sSidePopMini), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.RightTarget], 'jackpot');
        this.listen([...onSwitchClose(machine.sUnderUpperFlipper), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.LeftTarget], 'jackpot');
        this.listen([machine.upper3Bank.onTargetDown(0), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop1], 'jackpot');
        this.listen([machine.upper3Bank.onTargetDown(1), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop2], 'jackpot');
        this.listen([machine.upper3Bank.onTargetDown(2), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop3], 'jackpot');

        this.listen([e => e instanceof SpinnerRip, () => this.state._==='jackpotLit' && this.state.jp.startsWith('Left')], () => {
            if (time() < this.magnetOnUntil + 2000) return;
            this.magnetOnUntil = time() + 3000;
        });
        this.listen([onAnySwitchClose(machine.sShooterUpper, machine.sShooterMagnet, ...machine.sUpperLanes), () => time()<this.magnetOnUntil], () => this.magnetOnUntil = 0);

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
            (mb.gfx as any)?.notInstructions.visible(false);
            await alert('Full House Multiball!', 3000)[1];
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
        this.lastJp = this.state.jp;
        void playVoice('jackpot excited');

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
        const magJp = this.skillshotRng.weightedSelect([5, Jackpot.LeftTarget], [2, Jackpot.LeftLane], [2, undefined]);
        const ejectJp = this.skillshotRng.weightedSelect([2, undefined],  [3, Jackpot.RightTarget], [5, Jackpot.RightLane]);
        const jps = this.skillshotRng.shuffle([...Object.values(Jackpot), undefined, undefined]);
        jps.remove(magJp);
        jps.remove(ejectJp);
        const selections: (string|Jackpot|undefined)[] = [
            undefined,
            this.restartJp ?? magJp,
            this.restartJp ?? jps[0],
            this.restartJp ?? jps[1],
            this.restartJp ?? ejectJp,
            this.restartJp ?? jps[3],
        ];
        const verb = this.isRestarted? repeat('10K POINTS', 6) : [
            this.state._==='starting'&&this.state.secondBallLocked? '10K POINTS' : 'ONE-SHOT ADD-A-BALL',
            this.skillshotRng.weightedSelect([3, '100K points'], [3, 'JACKPOT +250K']),
            this.skillshotRng.weightedSelect([3, '100K points'], [3, 'JACKPOT +500KE']),
            this.skillshotRng.weightedSelect([3, '100K points'], [3, 'JACKPOT +250K']),
            this.skillshotRng.weightedSelect([3, '100K points'], [3, 'JACKPOT +500K']),
            this.skillshotRng.weightedSelect([3, '100K points'], [3, 'JACKPOT +250K']),
        ];

        return [...switches.map((sw, i) => {
            return {
                switch: sw,
                award: verb[i],
                dontOverride: i===0,
                display: !selections[i]? undefined : (selections[i] === 'random'? dImage('random_jp')
                    : dMany(
                        dClear(this.jpColor(selections[i] as Jackpot)!)!,
                        dImage('skill_light_jp'),
                )),
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
                        case 'JACKPOT +500K': this.base += 250000; break;
                        case 'JACKPOT +250K': this.base += 250000; break;
                        case '100K points': this.player.score += 100000; break;
                        case '10K POINTS': this.player.score += 10000; break;
                        default:
                            debugger;
                    }
                },
            };
        }), { award: 'color lights matching jackpot'}];
    }
}