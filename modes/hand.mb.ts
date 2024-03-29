import { Multiball } from './multiball';
import { addToScreen, alert, gfx, pfx, screen } from '../gfx';
import { fork } from '../promises';
import { DropBank, DropBankCompleteEvent, DropDownEvent, DropTarget, Standup } from '../drop-bank';
import { Player, SpinnerRip } from './player';
import { machine, SkillshotAward, StandupEvent } from '../machine';
import { State } from '../state';
import { Outputs } from '../outputs';
import { AnimParams } from 'aminogfx-gl';
import { onAnyPfSwitchExcept, onSwitchClose, SwitchEvent } from '../switch-matrix';
import { StraightMbGfx } from '../gfx/straight.mb';
import { light, Color, colorToHex, colorToArrow, flash, LightState } from '../light';
import { Priorities, Events } from '../events';
import { comma, and, assert, makeState, repeat, score, short, round } from '../util';
import { GateMode, Skillshot, SkillshotComplete as SkillshotComplete } from './skillshot';
import { Rng } from '../rand';
import { Card, Hand } from './poker';
import { Restart } from './restart';
import { HandMbGfx } from '../gfx/hand.mb';
import { dFitText, dImage } from '../disp';
import { playVoice } from '../sound';
import { FlashLights } from '../util-modes';


const Starting = makeState('starting', { 
    secondBallLocked: false,
    addABallReady: false,
});
const Started = makeState('started', { doubled: false });

export class HandMb extends Multiball {
    readonly bankColors = new Map<DropBank, Color>([
        [machine.centerBank, Color.Green],
        [machine.upper2Bank, Color.White],
        [machine.rightBank, Color.Blue],
        [machine.leftBank, Color.Purple],
        [machine.upper3Bank, Color.Green],
    ]);

    state: ReturnType<typeof Starting>|ReturnType<typeof Started> = Starting();

    baseValue = 30000;
    value = 100000;
    spinsPerJp = 25;

    get spinner() {
        return Math.ceil((this.value / this.spinsPerJp) / 100) * 100;
    }

    skillshotRng!: Rng;
    targetRng!: Rng;

    jackpots = 0;
    drops = 0;
    banks = 0;
    jackpotAwarded = false;
    redTargets = new Set<DropTarget|Standup>();
    topTotal = 0;

    leftTilRed = 2;

    getArrowColor(): LightState {
        let color = Color.Green;
        if (this.redTargets.size>10) return Color.Red;
        if (this.value > 200000) color = Color.Yellow;
        if (this.value > 500000) color = Color.Orange;
        if (this.value > 1000000) color = Color.White;
        
        // if (this.jackpotAwarded) return [color, 'fl'];
        // else
            return color;
    }

    protected constructor(
        player: Player,
        isRestarted = false,
    ) {
        super(player, isRestarted);
        if (machine.ballsLocked !== 'unknown')
            machine.ballsLocked++;
        this.skillshotRng = player.rng();
        this.targetRng = player.rng();
        State.declare<HandMb>(this, ['value', 'state', 'jackpotAwarded', 'redTargets']);
        player.storeData<HandMb>(this, ['skillshotRng', 'targetRng', 'topTotal']);
        this.spinsPerJp = this.skillshotRng.randRange(40, 60);
        const outs: any  = {};
        for (const target of machine.dropTargets) {
            if (!target.image) continue;
            outs[target.image.name] = () => {
                if (target.state) return undefined;
                if (this.jackpotAwarded || this.redTargets.has(target)) return dImage("x");
                return colorToArrow(this.bankColors.get(target.bank));
            };
        }
        for (const target of machine.standups) {
            outs[target[1].name] = () => light(this.redTargets.has(target) || this.jackpotAwarded, Color.Red);
        }
        this.out = new Outputs(this, {
            ...outs,
            rampUp: () => this.state._==='started' || (this.state._==='starting' && !this.state.addABallReady && (this.state.secondBallLocked || player.ball?.skillshot?.curAward !== 0)),
            lockPost: () => this.lockPost ?? (machine.sRampMade.wasClosedWithin(1500)? true : undefined),
            lRampArrow: () => this.state._ === 'started'?  [[this.getArrowColor(), 'fl', this.state.doubled? 6 : 3]]:
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)?  [[Color.Green, 'fl']] : undefined),
            iRamp: () => this.state._==='started'? dFitText((this.state.doubled? `${short(round(this.value, 10000))} *2` : score(this.value)), 64, 'center') : 
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)? dImage('add_a_ball') : undefined),
            getSkillshot: () => this.state._==='starting'? (ss: any) => this.getSkillshot(ss) : undefined,            
            leftGate: () => this.state._==='started'? true : undefined,
            rightGate: () => this.state._==='started'? true : undefined,
            spinnerValue: () => this.spinner,
            lSpinnerArrow: () => this.state._ === 'started'?  [[this.getArrowColor(), 'fl', this.value>250000? 4 : 2]] : undefined,
            iSS1: () => this.state._==='started' && !this.state.doubled? dImage('one_shot_double_jp') : undefined,
        });
        if (isRestarted && this.state._==='starting') this.state.secondBallLocked = true;
        this.misc = undefined;

        this.listen(onSwitchClose(machine.sRampMade), async () => {
            if (this.state._==='starting' && !this.state.secondBallLocked && !machine.cRamp.actual && this.state.addABallReady) {
                if (machine.ballsLocked !== 'unknown')
                    machine.ballsLocked++;
                this.state.secondBallLocked = true;
                this.state.addABallReady = false;
                void playVoice('ball added', undefined, true);
                await alert('ball locked')[1];
                await this.releaseBallFromTrough();
            }
        });

        this.listen(onSwitchClose(machine.sLeftOrbit), 'jackpot');

        this.listen([...onSwitchClose(machine.sShooterLower)], () => {
            if (this.state._==='started' && !this.state.doubled)
                this.state.doubled = true;
        });

        // this.listen(e => e instanceof SpinnerRip, 'collected');

        this.listen(onSwitchClose(machine.sSpinner), 'addRed');

        this.listen<DropBankCompleteEvent>([
            e => e instanceof DropBankCompleteEvent], 
        (e) => this.updateValue(undefined, e.bank));

        this.listen<DropDownEvent>(e => e instanceof DropDownEvent, (e) => this.updateValue(e.target));
        this.listen<StandupEvent>(e => e instanceof StandupEvent, (e) => this.updateValue(e.standup));

        this.listen(e => e instanceof SkillshotComplete, async () => {
            if (this.state._==='starting' && this.state.addABallReady) return;
            this.state = Started();
            await this.releaseBallsFromLock();
        });

        

        addToScreen(() => new HandMbGfx(this));
    }

    static async start(player: Player, isRestarted = false, value?: number, drops?: number, banks?: number, total = 0): Promise<HandMb|false> {
        const finish = await Events.tryPriority(Priorities.StartMb);
        if (!finish) return false;

        if (!player.curMode) {
            const hand = player.mbsQualified.get('HandMb') ?? [];
            if (!isRestarted) {
                player.mbsQualified.delete('HandMb');
            }
            const mb = new HandMb(player, isRestarted);
            if (value) mb.value = value;
            if (drops) mb.drops = drops;
            if (banks) mb.banks = banks;
            player.focus = mb;
            mb.total = total;
            (mb.gfx as any)?.notInstructions.visible(false);
            void playVoice('hand mb');
            await alert('Hand Multiball!', 4500)[1];
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
        if (this.state._==='starting' || machine.ballsLocked > 0) {
            await this.releaseBallsFromLock();
        }
        const ret = this.end();
        if (this.jackpots === 0 && !this.isRestarted) {
            this.player.addTemp(new Restart(this.player.ball!, Math.max(30 - this.drops * 4, 9), () => {
                return HandMb.start(this.player, true, this.value, this.drops, this.banks, this.total);
            }));
        }
        if (this.total > this.topTotal)
            this.topTotal = this.total;
        finish();
        return ret;
    }

    updateValue(target?: DropTarget|Standup, bank?: DropBank) {
        if (this.state._==='starting') return;
        if (this.jackpotAwarded || this.redTargets.has(target!)) {
            this.value = this.baseValue + this.jackpots*20000;
            this.drops = 0;
            this.banks = 0;
            this.jackpotAwarded = false;
            this.state.doubled = false;
            this.redTargets.clear();
        } else {
            const oldValue = this.value;
            if (oldValue < 200000) {
                if (typeof target === 'object') {
                    this.value += 10000 + 5000*this.banks + 1000*this.drops;
                    this.drops++;
                    // this.player.score += 1000;
                    // this.total += 1000;
                }
                if (bank) {
                    this.banks++;
                    this.value += 5000 * bank.targets.length;
                }
            }

            if ([200000, 400000, 600000, 800000, 1000000].some(v => this.value > v && oldValue < v)) {
                for (const target of this.targetRng.randSelect(...machine.dropBanks.filter(b => !b.targets.every(t => this.redTargets.has(t)))).targets) {
                    this.redTargets.add(target);
                }
            }
            if ([250000, 600000, 1000000].some(v => this.value > v && oldValue < v)) {
                void playVoice(Math.random()>.5? 'under the ramp' : 'shoot the spinner'); 
            }

        }
    }

    collected() {
        if (!this.jackpotAwarded) 
            this.jackpots++;
        this.jackpotAwarded = true;
    }

    async jackpot() {
        if (this.state._==='starting') return;
        const value = this.value * (this.state.doubled? 2 : 1);
        fork(FlashLights(machine.overrides, 2.5, Color.Green));
        const [group, promise] = alert('JACKPOT!', 4500, comma(value));
        this.collected();
        this.player.score += value;
        this.total += value;
        void playVoice(value > 200000? 'jackpot' : 'jackpot short', 75, true);
        if (this.state.doubled || this.redTargets.size>10)
            this.updateValue(); // undouble it
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
    }

    addRed() {
        this.leftTilRed--;
        if (this.leftTilRed === 0) {
            this.leftTilRed = 2;
        } else {
            return;
        }
        const avail = [
            ...machine.dropTargets.filter(t => !this.redTargets.has(t)),
            ...machine.standups.filter(t => !this.redTargets.has(t)),
        ];
        if (!avail.length) return;
        this.redTargets.add(this.targetRng.randSelect(...avail));
    }
    
    getSkillshot(ss: Skillshot): Partial<SkillshotAward>[] {
        const switches = ['first switch','second switch','third switch','upper lanes','upper eject hole','left inlane'];
        const values = [
            [[1, 5, 10]],
            [[10, 20, 25], [10, 25, 40], [5, 50]],
            [[10, 20, 30], [2, 40, 70]],
            ss.gateMode===GateMode.Closed? [[10, 15, 30], [3, 25, 50]] : 
                (ss.gateMode===GateMode.Open? [[10, 10, 30], [3, 20, 35]] : [[10, 15, 30], [3, 25, 50]]),
            ss.gateMode===GateMode.Closed? [[1, 20], [2, 40], [5, 60]] : 
                (ss.gateMode===GateMode.Open? [[5, 20], [2, 30], [1, 50]] : [[2, 30], [2, 40], [1, 75]]),
            ss.gateMode===GateMode.Closed? [[1, 10, 15]] : 
                (ss.gateMode===GateMode.Open? [[1, 1, 5]] : [[1, 20, 50]]),
        ];

        return [...switches.map((sw, i) => {
            const value = this.skillshotRng.weightedRange(...values[i] as any);
            return {
                switch: sw,
                award: this.state._==='starting'&&!this.state.secondBallLocked&&i===0? 'ONE-SHOT ADD-A-BALL' :
                    `JACKPOT +${short(value*1000)}` ,
                dontOverride: i===0,
                made: (e: SwitchEvent) => {
                    if (i===0 && this.state._==='starting' && !this.state.secondBallLocked) {
                        this.state.addABallReady = true; 
                        this.listen(onAnyPfSwitchExcept(), async (ev) => {
                            if (e === ev || ev.sw === e.sw || ev.sw === machine.sRightInlane) return;
                            const finish = await Events.tryPriority(Priorities.ReleaseMb);
                            if (ev.sw !== machine.sRampMade) {
                                this.state = Started();
                                await this.releaseBallsFromLock();
                            }
                            if (finish) finish();
                            return 'remove';
                        });
                        return;
                    }
                    
                    this.value += value;
                },
            };
        }), { award: ''}];
    }
}