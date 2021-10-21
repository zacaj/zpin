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
import { onChange, State } from '../state';
import { onAnyPfSwitchExcept, onAnySwitchClose, onSwitchClose, SwitchEvent } from '../switch-matrix';
import { time } from '../timer';
import { comma, makeState, repeat, round } from '../util';
import { FlashLights, ResetBank, ShimmerLights } from '../util-modes';
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

const jackpots: Jackpot[] = [
    Jackpot.RightLane,
    Jackpot.RightTarget,
    Jackpot.LeftTarget,
    Jackpot.LeftLane,
];

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
    topTotal = 0;

    jackpots = 0;

    lastJp?: Jackpot;

    static startValue = 1000000;

    get value(): number|undefined {
        if (this.state._ !== 'jackpotLit') return undefined;
        switch (this.state.jp) {
            case Jackpot.RightLane:
                if (machine.upper3Bank.targets[2].state)
                    return 300000/FullHouseMb.startValue*this.base+this.rightAdd;
                else
                    return 600000/FullHouseMb.startValue*this.base+this.rightAdd;
            case Jackpot.RightTarget:
                return 750000/FullHouseMb.startValue*this.base+this.rightAdd;
            case Jackpot.LeftLane:
                return 750000/FullHouseMb.startValue*this.base+this.leftAdd;
            case Jackpot.LeftTarget:
                return 500000/FullHouseMb.startValue*this.base+this.leftAdd;
            case Jackpot.Drop1:
            case Jackpot.Drop2:
            case Jackpot.Drop3:
                return 200000/FullHouseMb.startValue*this.base;
            default:
                throw new Error();
        }
    }

    base = FullHouseMb.startValue;
    leftAdd = 0;
    rightAdd = 0;

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

    catcherOnUntil = 0;

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
        State.declare<FullHouseMb>(this, ['state', 'catcherOnUntil']);
        player.storeData<FullHouseMb>(this, ['jpRng', 'skillshotRng', 'base', 'topTotal']);
        this.out = new Outputs(this, {
            rampUp: () => (this.state._==='starting' && !this.state.addABallReady && (this.state.secondBallLocked || player.ball?.skillshot?.curAward !== 0)),
            lockPost: () => this.lockPost ?? false,
            lRampArrow: () => this.state._ === 'started'? [[Color.White, 'fl']] : this.state._==='jackpotLit' && !this.state.jp.startsWith('Left')? [Color.Gray] :
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)?  [[Color.Green, 'fl']] : []),
            iRamp: () => (this.state._==='started' || (this.state._==='jackpotLit' && !this.state.jp.startsWith('Left')))? dImage('light_left_jackpot') : 
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)? dImage('add_a_ball') : undefined),
            lEjectArrow: () => this.state._ === 'started'? [[Color.White, 'fl']] : this.state._==='jackpotLit' && this.state.jp.startsWith('Left')? [Color.Gray] : [],
            iSS5: () => this.state._ === 'started' || (this.state._==='jackpotLit'&&this.state.jp.startsWith('Left'))? dImage('light_right_jackpot') : undefined,
            getSkillshot: () => this.state._==='starting'? () => this.getSkillshot() : undefined,
            lUpperLaneArrow: () => flash(this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.RightLane), this.jpColor(Jackpot.RightLane), 4),
            lUpperTargetArrow: () => flash(this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.RightTarget), this.jpColor(Jackpot.RightTarget), 4),
            lSideTargetArrow: () => flash(this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.LeftTarget), this.jpColor(Jackpot.LeftTarget), 4),
            lSideShotArrow: () => flash(this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.LeftLane), this.jpColor(Jackpot.LeftLane), 4),
            // iUpper31: () => ((time()/300%2)|0)===0 && (this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop1))? colorToArrow(this.jpColor(Jackpot.Drop1)) : undefined,
            // iUpper32: () => ((time()/300%2)|0)===0 && (this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop2))? colorToArrow(this.jpColor(Jackpot.Drop2)) : undefined,
            // iUpper33: () => ((time()/300%2)|0)===0 && (this.state._==='starting' || (this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop3))? colorToArrow(this.jpColor(Jackpot.Drop2)) : 
            //             (this.state._==='jackpotLit' && this.state.jp===Jackpot.RightLane && !machine.upper3Bank.targets[2].state)? dImage('x') : undefined,
            iUpper33: () => (this.state._==='jackpotLit' && this.state.jp===Jackpot.RightLane && !machine.upper3Bank.targets[2].state)? dImage('x') : undefined,
            rightGate: true,
            leftGate: true,
            catcher: () => this.state._==='jackpotLit' && this.state.jp.startsWith('Left'), //time()<this.catcherOnUntil,
            iSpinner: () =>  this.state._==='jackpotLit' && this.state.jp.startsWith('Left')? dImage('stop_h') : undefined,
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
                void playVoice('ball added', undefined, true);
                await alert('ball locked')[1];
                await this.releaseBallFromTrough();
            }
            else {
                if  (this.state._!=='jackpotLit' || !this.state.jp.startsWith('Left')) {
                    this.state = JackpotLit(this.jpRng.randSelect(...jackpots.filter(j => j.startsWith('Left')) as Jackpot[]));
                    void playVoice('jackpot is lit', undefined, true);
                }
                await this.releaseBallsFromLock();
                this.total += 10000;
                this.player.score += 10000;
            }
        });
        this.listen([...onSwitchClose(machine.sUpperEject)], () => {
            if (machine.sUpperInlane.wasClosedWithin(1500) && this.state._==='jackpotLit' && this.state.jp===Jackpot.LeftLane) {
                return this.jackpot();
            } else if (!machine.sUpperInlane.wasClosedWithin(1000)) {
                if (this.state._ !== 'jackpotLit' || this.state.jp.startsWith('Left')) {
                    this.state = JackpotLit(this.jpRng.randSelect(...jackpots.filter(j => !j.startsWith('Left')) as Jackpot[]));
                    this.total += 10000;
                    this.player.score += 10000;
                }
                if (this.state.jp !== Jackpot.RightTarget && machine.upper3Bank.targets.some(t => t.state))
                    fork(ResetBank(this, machine.upper3Bank));
            }
        });

        // this.listen([onChange(this, 'state'), () => this.state._==='jackpotLit' && this.state.jp.startsWith('Left')], () => this.catcherOnUntil = time() + 60000);

        this.listen([...onSwitchClose(machine.sBackLane), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.RightLane], 'jackpot');
        this.listen([...onSwitchClose(machine.sSidePopMini), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.RightTarget], 'jackpot');
        this.listen([...onSwitchClose(machine.sUnderUpperFlipper), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.LeftTarget], 'jackpot');
        this.listen([machine.upper3Bank.onTargetDown(0), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop1], 'jackpot');
        this.listen([machine.upper3Bank.onTargetDown(1), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop2], 'jackpot');
        this.listen([machine.upper3Bank.onTargetDown(2), () => this.state._==='jackpotLit' && this.state.jp===Jackpot.Drop3], 'jackpot');

        // this.listen([e => e instanceof SpinnerRip, () => this.state._==='jackpotLit' && this.state.jp.startsWith('Left')], () => {
        //     if (time() < this.catcherOnUntil + 2000) return;
        //     this.catcherOnUntil = time() + 60000;
        // });
        // this.listen([onAnySwitchClose(machine.sShooterUpper, machine.sShooterMagnet, ...machine.sUpperLanes), () => time()<this.catcherOnUntil], () => this.catcherOnUntil = 0);

        addToScreen(() => new FullHouseMbGfx(this));
    }

    static async start(player: Player, isRestarted = false, jp?: Jackpot, total = 0): Promise<FullHouseMb|false> {
        const finish = await Events.tryPriority(Priorities.StartMb);
        if (!finish) return false;

        if (!player.curMode) {
            const hand = player.mbsQualified.get('FullHouseMb') ?? [];
            if (!isRestarted) {
                player.mbsQualified.delete('FullHouseMb');
            }
            const mb = new FullHouseMb(player, hand, isRestarted, jp);
            player.focus = mb;
            mb.total = total;
            (mb.gfx as any)?.notInstructions.visible(false);
            void playVoice('full house mb');
            await alert('Full House Multiball!', 5000)[1];
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
            this.player.noMode?.addTemp(new Restart(this.player.ball!, 14, () => {
                return FullHouseMb.start(this.player, true, this.state._==='jackpotLit'? this.state.jp : undefined, this.total);
            }));
        }
        if (this.total > this.topTotal)
            this.topTotal = this.total;
        this.total = Math.max(this.total, 1);
        this.player.fullHouseMbStatus += this.total;
        if (this.player.straightMbStatus && this.player.flushMbStatus && this.player.fullHouseMbStatus)
            this.player.royalFlushReady = true;
        finish();
        return ret;
    }

    async jackpot() {
        if (this.state._ !== 'jackpotLit') {
            debugger;
            return;
        }
        this.jackpots++;
        if (this.value! > 400000)
            void playVoice('jackpot excited echo', 75, true);
        else
            void playVoice('jackpot excited', 75, true);

        fork(FlashLights(machine.overrides, 1.5, Color.Yellow).then(() => ShimmerLights(machine.overrides, 900, Color.Yellow)));
        const [group, promise] = alert('JACKPOT!', 4500, comma(this.value!));
        this.player.score += this.value!;
        this.total += this.value!;
        const anim: AnimParams = {
            from: 1,
            to: 2,
            duration: 350,
            loop: 4,
            timeFunc: 'linear',
        };
        group.sx.anim(anim).start();
        group.sy.anim(anim).start();
        this.base += round(this.value! * ((this.state.jp.startsWith('Left')!==this.lastJp?.startsWith('Left'))? .3 : .15), 50000, 50000);
        this.lastJp = this.state.jp;
        this.state = Started();
    }

    
    getSkillshot(): Partial<SkillshotAward>[] {
        const switches = ['first switch','second switch','third switch','upper lanes','upper eject hole','left inlane'];
        const magJp = this.skillshotRng.weightedSelect([5, Jackpot.LeftTarget], [2, Jackpot.LeftLane], [2, undefined]);
        const ejectJp = this.skillshotRng.weightedSelect([2, undefined],  [3, Jackpot.RightTarget], [5, Jackpot.RightLane]);
        const jps = this.skillshotRng.shuffle([...jackpots, undefined, undefined]);
        jps.remove(magJp);
        jps.remove(ejectJp);
        // const selections: (string|Jackpot|undefined)[] = [
        //     undefined,
        //     this.restartJp ?? magJp,
        //     this.restartJp ?? jps[0],
        //     this.restartJp ?? jps[1],
        //     this.restartJp ?? ejectJp,
        //     this.restartJp ?? jps[3],
        // ];
        const verb = this.isRestarted? repeat('10K POINTS', 6) : [
            this.state._==='starting'&&this.state.secondBallLocked? '10K POINTS' : 'ONE-SHOT ADD-A-BALL',
            // this.skillshotRng.weightedSelect([3, '100K points'], [3, 'JACKPOT +250K']),
            // this.skillshotRng.weightedSelect([3, '100K points'], [3, 'JACKPOT +500K']),
            // this.skillshotRng.weightedSelect([3, '100K points'], [3, 'JACKPOT +250K']),
            // this.skillshotRng.weightedSelect([3, '100K points'], [3, 'JACKPOT +500K']),
            // this.skillshotRng.weightedSelect([3, '100K points'], [3, 'JACKPOT +250K']),
            ...[
                'LEFT JACKPOT +250K',
                'RIGHT JACKPOT +250K',
                'JACKPOTS +100K',
                'LIGHT LEFT JACKPOT',
                'LIGHT RIGHT JACKPOT',
                undefined,
                undefined,
            ].shuffle(() => this.skillshotRng.rand()).slice(0, 5),
        ];

        return [...switches.map((sw, i) => {
            return {
                switch: sw,
                award: verb[i],
                dontOverride: !!verb[i],
                // display: !selections[i]? undefined : (selections[i] === 'random'? dImage('random_jp')
                //     : dMany(
                //         dClear(this.jpColor(selections[i] as Jackpot)!)!,
                //         dImage('skill_light_jp'),
                // )),
                collect: () => {
                    if (this.state._==='starting' && this.state.addABallReady) return;
                    // if (!selections[i])
                    if (this.state._==='starting')
                        this.state = Started();
                    // else
                    //     this.state = JackpotLit(selections[i]==='random'? 
                    //         this.skillshotRng.randSelect(...jackpots)  : (selections[i] as Jackpot));
                    fork(this.releaseBallsFromLock());
                },
                made: (e: SwitchEvent) => {
                    switch (verb[i]) {
                        case 'ONE-SHOT ADD-A-BALL': 
                            if (i===0 && this.state._==='starting' && !this.state.secondBallLocked) {
                                this.state.addABallReady = true; 
                                this.listen(onAnyPfSwitchExcept(), (ev) => {
                                    if (e === ev || ev.sw === e.sw || ev.sw === machine.sRightInlane) return;
                                    if (ev.sw !== machine.sRampMade) {
                                        this.state = Started();
                                        fork(this.releaseBallsFromLock());
                                    }
                                    return 'remove';
                                });
                                return;
                            }
                        break;
                        case 'JACKPOT +500K': this.base += 500000; break;
                        case 'JACKPOT +250K': this.base += 250000; break;
                        case '100K points': this.player.score += 100000; break;
                        case '10K POINTS': this.player.score += 10000; break;
                        case 'LEFT JACKPOT +250K': this.leftAdd += 250000; break;
                        case 'RIGHT JACKPOT +250K': this.rightAdd += 250000; break;
                        case 'JACKPOTS +100K': this.leftAdd += 100000; this.rightAdd += 100000; break;
                        case 'LIGHT LEFT JACKPOT': this.state = JackpotLit(this.skillshotRng.randSelect(...jackpots.filter(jp => jp.startsWith('Left')))); break;
                        case 'LIGHT RIGHT JACKPOT': this.state = JackpotLit(this.skillshotRng.randSelect(...jackpots.filter(jp => !jp.startsWith('Left')))); break;
                        default:
                            debugger;
                    }
                },
            };
        }), { award: 'color lights matching jackpot'}];
    }
}