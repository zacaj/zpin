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
import { comma, and, assert, makeState, repeat, score, short } from '../util';
import { GateMode, Skillshot, SkillshotComplete as SkillshotComplete } from './skillshot';
import { Rng } from '../rand';
import { Card, Hand } from './poker';
import { Restart } from './restart';
import { HandMbGfx } from '../gfx/hand.mb';
import { dFitText, dImage } from '../disp';
import { playVoice } from '../sound';


const Starting = makeState('starting', { 
    secondBallLocked: false,
    addABallReady: false,
});
const Started = makeState('started', {});

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
    spinsPerJp = 30;

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

    total = 0;

    getArrowColor(): LightState {
        let color = Color.Green;
        if (this.value > 200000) color = Color.Yellow;
        if (this.value > 500000) color = Color.Orange;
        if (this.value > 1000000) color = Color.Red;
        
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
            lRampArrow: () => this.state._ === 'started'?  [[this.getArrowColor(), 'fl']]:
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)?  [[Color.Green, 'fl']] : undefined),
            iRamp: () => this.state._==='started'? dFitText(score(this.value), 64, 'center') : 
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady)? dImage('add_a_ball') : undefined),
            getSkillshot: () => this.state._==='starting'? (ss: any) => this.getSkillshot(ss) : undefined,            
            leftGate: () => this.state._==='started'? true : undefined,
            rightGate: () => this.state._==='started'? true : undefined,
            spinnerValue: () => this.spinner,
        });
        if (isRestarted && this.state._==='starting') this.state.secondBallLocked = true;
        this.misc = undefined;

        this.listen(onSwitchClose(machine.sRampMade), async () => {
            if (this.state._==='starting' && !this.state.secondBallLocked) {
                if (machine.ballsLocked !== 'unknown')
                    machine.ballsLocked++;
                this.state.secondBallLocked = true;
                this.state.addABallReady = false;
                await alert('ball locked')[1];
                await this.releaseBallFromTrough();
            }
        });

        this.listen(onSwitchClose(machine.sLeftOrbit), 'jackpot');

        // this.listen(e => e instanceof SpinnerRip, 'collected');

        this.listen(onSwitchClose(machine.sSpinner), 'addRed');

        this.listen<DropBankCompleteEvent>([
            e => e instanceof DropBankCompleteEvent], 
        (e) => this.updateValue(undefined, e.bank));

        this.listen<DropDownEvent>(e => e instanceof DropDownEvent, (e) => this.updateValue(e.target));
        this.listen<StandupEvent>(e => e instanceof StandupEvent, (e) => this.updateValue(e.standup));

        

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
            await alert('Hand Multiball!', 3000)[1];
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
            this.player.noMode?.addTemp(new Restart(this.player.ball!, Math.max(30 - this.drops * 4, 9), () => {
                return HandMb.start(this.player, true, this.value, this.drops, this.banks, this.total);
            }));
        }
        if (this.total > this.topTotal)
            this.topTotal = this.total;
        finish();
        return ret;
    }

    updateValue(target?: DropTarget|Standup, bank?: DropBank) {
        if (this.jackpotAwarded || this.redTargets.has(target!)) {
            this.value = this.baseValue + this.jackpots*20000;
            this.drops = 0;
            this.banks = 0;
            this.jackpotAwarded = false;
            this.redTargets.clear();
        } else {
            const oldValue = this.value;
            if (typeof target === 'object') {
                this.value += 25000 + 10000*this.banks + 1500*this.drops;
                this.drops++;
                this.player.score += 5000;
                this.total += 5000;
            }
            if (bank) {
                this.banks++;
                this.value += 10000 * bank.targets.length;
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
        const [group, promise] = alert('JACKPOT!', 4500, comma(this.value));
        this.collected();
        this.player.score += this.value;
        this.total += this.value;
        void playVoice(this.value > 500000? 'jackpot' : 'jackpot short');
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
                collect: () => {
                    if (this.state._==='starting' && this.state.addABallReady) return;
                    this.state = Started();
                    fork(this.releaseBallsFromLock());
                },
                made: (e: SwitchEvent) => {
                    if (i===0 && this.state._==='starting' && !this.state.secondBallLocked) {
                        this.state.addABallReady = true; 
                        this.listen(onAnyPfSwitchExcept(), (ev) => {
                            if (e === ev || (ev.sw === e.sw && ev.when - e.when < 3000)) return;
                            if (ev.sw !== machine.sRampMade) {
                                this.state = Started();
                                fork(this.releaseBallsFromLock());
                            }
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