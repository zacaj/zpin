import { AnimParams } from 'aminogfx-gl';
import { dClear, dImage, DisplayContent, dMany } from '../disp';
import { DropBank, DropBankCompleteEvent, DropDownEvent, DropTarget, Shot, Standup, Thing } from '../drop-bank';
import { Events, Priorities } from '../events';
import { addToScreen, alert, pfx } from '../gfx';
import { FlushMbGfx } from '../gfx/flush.mb';
import { Color, colorToArrow, colorToHex, flash } from '../light';
import { machine, SkillshotAward } from '../machine';
import { Outputs } from '../outputs';
import { fork } from '../promises';
import { Rng } from '../rand';
import { playVoice } from '../sound';
import { State } from '../state';
import { onAnyPfSwitchExcept, onAnySwitchClose, onSwitchClose, Switch, SwitchEvent } from '../switch-matrix';
import { Time, time, Timer, TimerQueueEntry } from '../timer';
import { comma, makeState, repeat } from '../util';
import { ResetBank } from '../util-modes';
import { Multiball } from './multiball';
import { Player, SpinnerHit, SpinnerRip } from './player';
import { Card } from './poker';
import { Restart } from './restart';

type Jp = DropTarget|Standup|Shot;

const Starting = makeState('starting', { 
    secondBallLocked: false,
    addABallReady: false,
});
const Started = makeState('started', {});
const JackpotLit = makeState('jackpotLit', (jp: Jp, value: number, startTime = time()) => ({ jp, value, startTime }));

export class FlushMb extends Multiball {

    state: ReturnType<typeof Starting>|ReturnType<typeof Started>|ReturnType<typeof JackpotLit> = Starting();
    jackpots = 0;
    skillshotRng!: Rng;
    countdown?: TimerQueueEntry;

    standupMult = 1;
    targetMult = 1;
    shotMult = 1;
    standupSpeed = 1;
    targetSpeed = 1;
    shotSpeed = 1;
    topTotal = 0;

    protected constructor(
        player: Player,
        public hand: Card[],
        isRestarted = false,
        public lastJps: (Jp|DropBank)[] = [],
    ) {
        super(player, isRestarted);
        if (machine.ballsLocked !== 'unknown')
            machine.ballsLocked++;
        this.skillshotRng = player.rng();
        State.declare<FlushMb>(this, ['state', 'lastJps']);
        player.storeData<FlushMb>(this, ['skillshotRng', 'standupMult', 'targetMult', 'shotMult', 'standupSpeed', 'targetSpeed', 'shotSpeed', 'topTotal']);

        const outs: any  = {};
        // for (const light of machine.lights) {
        //     outs[light.name] = [];
        // }
        for (const target of machine.dropTargets) {
            if (!target.image) continue;
            outs[target.image.name] = () => this.state._==='jackpotLit'&&('bank' in this.state.jp)&&this.state.jp.bank===target.bank&&!target.state? dImage('yellowArrow') : 
                                            this.state._==='started'&&this.lastJps?.includes(target.bank)? dImage("x") : dClear(Color.Black);
        }
        // for (const lane of machine.upperLanes) {
        //     const {sw,light} = lane;
        //     outs[light.name] = () => this.state._==='jackpotLit'&&('isLane' in this.state.jp)&&machine.upperLanes.includes(this.state.jp)&&this.state.jp!==lane? [[Color.Yellow, 'fl']] : [];
        // }
        // for (const lane of machine.lowerLanes) {
        //     const {sw,light} = lane;
        //     outs[light.name] = () => this.state._==='jackpotLit'&&('isLane' in this.state.jp)&&machine.lowerLanes.includes(this.state.jp)&&this.state.jp!==lane? [[Color.Yellow, 'fl']] : [];
        // }
        for (const standup of machine.standups) {
            outs[standup[1].name] = () => this.state._==='jackpotLit'&&(Array.isArray(this.state.jp))&&this.state.jp===standup? [[Color.Yellow, 'fl']] : 
                                            this.state._==='started'&&!this.lastJps?.includes(standup)? [Color.Blue] : [];
        }
        for (const shot of [machine.spinnerShot, machine.rampShot, machine.ejectShot]) {
            outs[shot.light.name] = () => this.state._==='jackpotLit'&&('isShot' in this.state.jp)&&this.state.jp===shot? [[Color.Yellow, 'fl']] : 
            this.state._==='started'&&!this.lastJps?.includes(shot)? [Color.Blue] : [];
        }
        const origRamp = outs.lRampArrow;
        this.out = new Outputs(this, {
            ...outs,
            rampUp: () => (this.state._==='starting' && !this.state.addABallReady && (this.state.secondBallLocked || player.ball?.skillshot?.curAward !== 0) 
                || (this.state._!=='starting')),
            lockPost: () => this.lockPost ?? false,
            lRampArrow: () => 
                (this.state._==='starting' && !this.state.secondBallLocked && (player.ball?.skillshot?.curAward === 0 || this.state.addABallReady))?  [[Color.Green, 'fl']] :
                origRamp(),
            getSkillshot: () => this.state._==='starting'? () => this.getSkillshot() : undefined,
            rightGate: true,
            leftGate: true,
        });
        if (isRestarted && this.state._==='starting') this.state.secondBallLocked = true;

        this.misc?.targets.clear();

        this.listen<DropDownEvent>(e => e instanceof DropDownEvent, e => this.checkSwitch(e.target.switch, e.target));
        this.listen(onAnySwitchClose(...machine.standups.map(s => s[0])), e => this.checkSwitch(e.sw, machine.standups.find(s => s[0]===e.sw)!));
        this.listen(onAnySwitchClose(machine.sUpperEject), () => this.checkSwitch(machine.sUpperEject, machine.ejectShot));
        this.listen(e => e instanceof SpinnerHit, () => this.checkSwitch(machine.sSpinner, machine.spinnerShot));

        this.listen(onSwitchClose(machine.sRampMade), async () => {
            if (machine.ballsLocked !== 'unknown')
                machine.ballsLocked++;
            if (this.state._==='starting' && !this.state.secondBallLocked) {
                this.state.secondBallLocked = true;
                this.state.addABallReady = false;
                void playVoice('ball added');
                await alert('ball locked')[1];
                await this.releaseBallFromTrough();
            }
            else 
                return this.checkSwitch(machine.sRampMade, machine.rampShot);
        });

        this.listen<DropBankCompleteEvent>([e => e instanceof DropBankCompleteEvent, e => this.state._==='jackpotLit'&&('bank' in this.state.jp)&&this.state.jp.bank===e.bank], () => this.state = Started())

        addToScreen(() => new FlushMbGfx(this));
    }

    static async start(player: Player, isRestarted = false, lastJps: any[] = [], total = 0): Promise<FlushMb|false> {
        const finish = await Events.tryPriority(Priorities.StartMb);
        if (!finish) return false;

        if (!player.curMode) {
            const hand = player.mbsQualified.get('FlushMb') ?? [];
            if (!isRestarted) {
                player.mbsQualified.delete('FlushMb');
            }
            const mb = new FlushMb(player, hand, isRestarted, lastJps);
            player.focus = mb;
            mb.total = total;
            (mb.gfx as any)?.notInstructions.visible(false);
            void playVoice('flush mb');
            await alert('Flush Multiball!', 6000)[1];
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
        if (this.jackpots < 6 && this.total < 250000 && !this.isRestarted) {
            this.player.noMode?.addTemp(new Restart(this.player.ball!, 30 - this.jackpots * 3, () => {
                return FlushMb.start(this.player, true, this.lastJps, this.total);
            }));
        }
        if (this.total > this.topTotal)
            this.topTotal = this.total;
        finish();
        return ret;
    }

    checkSwitch(sw: Switch, jp: Jp) {
        if (this.state._==='starting') return;
        if (this.state._==='jackpotLit') {
            if (time() - this.state.startTime < 250) return;
            if ('bank' in this.state.jp && this.state.jp.bank === (jp as DropTarget).bank)
                return this.jackpot();
            if ('isShot' in this.state.jp && this.state.jp.sw === sw)
                return this.jackpot();
            if (Array.isArray(this.state.jp) && this.state.jp[0] === sw)
                return this.jackpot();
        }

        if (this.lastJps?.includes(jp) || ('bank' in jp && this.lastJps?.includes(jp.bank)))
            return;

        const startValue = this.calcValue(jp);
        this.state = JackpotLit(jp, startValue);
        if (jp === machine.rampShot)
            void playVoice('shoot the ramp');
        if (jp === machine.spinnerShot)
            void playVoice('shoot the spinner');

        this.countdown = Timer.setInterval((entry) => {
            if (this.state._ !== 'jackpotLit') return;
            const newValue = this.state.value - 770 * ('bank' in this.state.jp? this.targetMult*this.targetSpeed : 'isShot' in this.state.jp? this.shotMult*this.shotSpeed : this.standupMult*this.standupSpeed);
            if (newValue > 0)
                this.state = JackpotLit(this.state.jp, newValue, this.state.startTime);
            else 
                this.state = Started();
            if (newValue <= startValue/2 && entry.repeat === 100)
                entry.repeat = 50 as Time;
        }, 100, 'flush countdown', 1000);
    }

    calcValue(jp: Jp): number {
        const s = 750;
        if ('bank' in jp) {
            if (jp.bank === machine.upper2Bank)
                return 500*s*this.standupMult;
            if (jp.bank === machine.upper3Bank)
                return 300*s*this.standupMult;
            if (jp.bank === machine.centerBank)
                return 150*s*this.standupMult;
            if (jp.bank === machine.leftBank)
                return 200*s*this.standupMult;
            if (jp.bank === machine.rightBank)
                return 200*s*this.standupMult;
        }
        if ('isShot' in jp) {
            if (jp === machine.rampShot)
                return 350*s*this.shotMult;
            if (jp === machine.ejectShot)
                return 200*s*this.shotMult;
            if (jp === machine.spinnerShot)
                return 350*s*this.shotMult;
        }
        if (Array.isArray(jp)) {
            if (jp[0] === machine.sRampMiniOuter)
                return 1000*s*this.standupMult;
            if (jp[0] === machine.sRampMini)
                return 200*s*this.standupMult;
            if (jp[0] === machine.sSingleStandup)
                return 250*s*this.standupMult;
            if (jp[0] === machine.sSidePopMini)
                return 750*s*this.standupMult;
            if (jp[0] === machine.sUpperPopMini)
                return 400*s*this.standupMult;
        }
        return 250*s;
    }

    async jackpot() {
        if (this.state._ !== 'jackpotLit') {
            debugger;
            return;
        }
        if (this.countdown)
            Timer.cancel(this.countdown);

        if ('bank' in this.state.jp) {
            fork(ResetBank(this, this.state.jp.bank));
            this.lastJps.push(this.state.jp.bank);
        }
        else 
            this.lastJps.push(this.state.jp);
        
        if (this.lastJps.length > 7)
            this.lastJps.shift();

        this.jackpots++;
        void playVoice('jackpot short');

        const [group, promise] = alert('JACKPOT!', 3000, comma(this.state.value));
        this.player.score += this.state.value;
        this.total += this.state.value;
        const anim: AnimParams = {
            from: 1,
            to: 2,
            duration: 350,
            loop: 2,
            timeFunc: 'linear',
        };
        group.sx.anim(anim).start();
        group.sy.anim(anim).start();
        // this.base += 250000;
        this.state = Started();
    }

    
    getSkillshot(): Partial<SkillshotAward>[] {
        const switches = ['first switch','second switch','third switch','upper lanes','upper eject hole','left inlane'];

        const selections: (DisplayContent)[] = [
            dClear(Color.Black),
            !this.isRestarted ? dImage(this.skillshotRng.randSelect('slower_standups', 'slower_targets', 'slower_shots')) : dClear(Color.Black),
            !this.isRestarted ? dImage(this.skillshotRng.randSelect('slower_standups', 'slower_targets', 'slower_shots')) : dClear(Color.Black),
            !this.isRestarted ? dImage(this.skillshotRng.randSelect('slower_standups', 'slower_targets', 'slower_shots')) : dClear(Color.Black),
            !this.isRestarted ? dImage(this.skillshotRng.randSelect('slower_standups', 'slower_targets', 'slower_shots')) : dClear(Color.Black),
            !this.isRestarted ? dImage(this.skillshotRng.randSelect('slower_standups', 'slower_targets', 'slower_shots')) : dClear(Color.Black),
        ];
        const verb = this.isRestarted? repeat('10K POINTS', 6) : [
            this.state._==='starting'&&this.state.secondBallLocked? '10K POINTS' : 'ONE-SHOT ADD-A-BALL',
            this.skillshotRng.weightedSelect([3, '2X TARGETS'], [3, '2X STANDUPS'], [3, '2X SHOTS'], [3, '250K points']),
            this.skillshotRng.weightedSelect([3, '2X TARGETS'], [3, '2X STANDUPS'], [3, '2X SHOTS'], [3, '250K points']),
            this.skillshotRng.weightedSelect([3, '2X TARGETS'], [3, '2X STANDUPS'], [3, '2X SHOTS'], [3, '250K points']),
            this.skillshotRng.weightedSelect([3, '2X TARGETS'], [3, '2X STANDUPS'], [3, '2X SHOTS'], [3, '250K points']),
            this.skillshotRng.weightedSelect([3, '100K points'], [3, '50K points']),
        ];

        return [...switches.map((sw, i) => {
            return {
                switch: sw,
                award: verb[i],
                dontOverride: i===0,
                display: selections[i],
                collect: () => {
                    if (this.state._==='starting' && this.state.addABallReady) return;
                    if (selections[i].images)
                        switch (selections[i].images![0]) {
                            case 'slower_standups':
                                this.standupSpeed *= .5;
                                break;
                            case 'slower_targets':
                                this.targetSpeed *= .5;
                                break;
                            case 'slower_shots':
                                this.shotSpeed *= .5;
                                break;
                        }
                    this.state = Started();
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
                        case '2X TARGETS': this.targetMult++; break;
                        case '2X STANDUPS': this.standupMult++; break;
                        case '2X SHOTS': this.shotMult++; break;
                        case '250K points': this.player.score += 250000; break;
                        case '100K points': this.player.score += 100000; break;
                        case '50K points': this.player.score += 50000; break;
                        case '10K POINTS': this.player.score += 10000; break;
                        default:
                            debugger;
                    }
                },
            };
        }), { award: 'color lights matching jackpot'}];
    }
}