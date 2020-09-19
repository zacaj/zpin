import { Multiball } from './multiball';
import { alert, gfx } from '../gfx';
import { fork } from '../promises';
import { DropBank, DropBankCompleteEvent } from '../drop-bank';
import { Player } from './player';
import { machine, SkillshotAward } from '../machine';
import { State } from '../state';
import { Outputs } from '../outputs';
import { AnimParams } from 'aminogfx-gl';
import { onSwitchClose } from '../switch-matrix';
import { StraightMbGfx } from '../gfx/straight.mb';
import { light, Color, colorToHex, colorToArrow } from '../light';
import { Priorities, Events } from '../events';
import { comma, assert } from '../util';
import { SkillshotEomplete as SkillshotComplete } from './skillshot';
import { Rng } from '../rand';
import { Card } from './poker';


export class StraightMb extends Multiball {
    readonly bankColors = new Map<DropBank, Color>([
        [machine.centerBank, Color.Red],
        [machine.upper2Bank, Color.Orange],
        [machine.rightBank, Color.Yellow],
        [machine.leftBank, Color.Green],
        [machine.upper3Bank, Color.Blue],
    ]);

    jackpotLit = false;
    curBank?: DropBank;
    value = 1000000;
    awardingJp = 0;
    started = false;
    secondBallLocked = false;

    skillshotRng!: Rng;
    bankRng!: Rng;

    protected constructor(
        player: Player,
        public hand: Card[],
    ) {
        super(player);
        this.skillshotRng = player.rng();
        this.bankRng = player.rng();
        State.declare<StraightMb>(this, ['curBank', 'awardingJp', 'jackpotLit', 'started', 'secondBallLocked']);
        player.storeData<StraightMb>(this, ['value', 'bankRng', 'skillshotRng']);
        const outs: any  = {};
        for (const target of machine.dropTargets) {
            outs[target.image.name] = () => {
                if (!this.started)
                    return colorToArrow(this.bankColors.get(target.bank));

                if (target.state || this.jackpotLit) return undefined;
                
                if (this.curBank && !this.jackpotLit) {
                    if (target.bank === this.curBank)
                        return colorToArrow(this.bankColors.get(this.curBank));
                    return undefined;
                }
                return undefined;
            };
        }
        this.out = new Outputs(this, {
            ...outs,
            rampUp: () => !this.jackpotLit && !this.awardingJp && (this.started || this.secondBallLocked),
            lockPost: () => this.lockPost ?? false,
            lRampArrow: () => light(this.jackpotLit, Color.Red),
            getSkillshot: () => () => this.getSkillshot(),
            ignoreSkillsot: set => (this.started)? set : new Set([...set ?? [], machine.sRampMade, ...(this.secondBallLocked? [] : [machine.sRightInlane])]),
        });

        this.listen(onSwitchClose(machine.sRampMade), () => {
            if (!this.started && !this.secondBallLocked) {
                this.secondBallLocked = true;
                return this.releaseBallFromTrough();
            }
            return this.jackpot();
        });

        this.listen<DropBankCompleteEvent>([e => e instanceof DropBankCompleteEvent, e => e.bank === this.curBank], () => this.jackpotLit = true);

        this.listen(e => e instanceof SkillshotComplete, () => {
            this.started = true;
            this.secondBallLocked = false;
            return this.releaseBallsFromLock();
        });

        this.gfx?.add(new StraightMbGfx(this));
    }

    static async start(player: Player): Promise<StraightMb|false> {
        const finish = await Events.tryPriority(Priorities.StartMb);
        if (!finish) return false;

        if (!player.curMode) {
            const hand = player.mbsQualified.get('StraightMb')!;
            player.mbsQualified.delete('StraightMb');
            player.mbsQualified.clear();
            const mb = new StraightMb(player, hand);
            mb.gfx?.visible(false);
            player.ball.addChild(mb);
            await alert('Multiball!', 3000)[1];
            mb.gfx?.visible(true);
            await mb.start();
            await mb.releaseBallFromTrough();
            finish();
            return mb;
        } else {
            finish();
            return false;
        }
    }

    end() {
        return super.end();
    }

    firstSwitchHit() {        
        return super.firstSwitchHit();
    }

    selectBank(bank?: DropBank) {
        if (bank) {
            this.curBank = bank;
            return;
        }
        const i = this.bankRng.weightedRand(1, 1, 5, 0, 3, 3);
        this.curBank = machine.dropBanks[i];
    }

    async jackpot() {
        if (this.awardingJp)
            fork(this.releaseBallFromLock());
        this.awardingJp++;
        const [group, promise] = alert('JACKPOT!', 5000, comma(this.value));
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
        this.awardingJp--;
        if (this.awardingJp === 0) {
            fork(this.releaseBallFromLock());
            this.value += 500000;
            this.jackpotLit = false;
            this.selectBank();
        }
    }

    
    getSkillshot(): Partial<SkillshotAward>[] {
        const switches = ['right inlane','lower magnet switch','upper magnet switch','upper lanes','upper eject hole','left inlane'];
        const selections: (string|DropBank)[] = [
            'random', 
            this.skillshotRng.weightedSelect([5, machine.centerBank], [3, machine.leftBank]),
            this.skillshotRng.weightedSelect([5, machine.leftBank], [2, machine.centerBank], [2, machine.rightBank]),
            this.skillshotRng.weightedSelect([4, machine.leftBank], [3, machine.rightBank], [1, machine.centerBank]),
            this.skillshotRng.weightedSelect([5, machine.centerBank], [5, machine.leftBank]),
            this.skillshotRng.weightedSelect([5, machine.leftBank]),
        ];
        const verb = [
            'ADD 50K TO',
            'DOUBLE',
            'DOUBLE',
            '1.5X',
            'TRIPLE',
            'ADD 500K TO',
        ];

        return [...switches.map((sw, i) => {
            return {
                switch: sw,
                award: verb[i]+' Jackpot',
                display: typeof selections[i] === 'string'? selections[i] as string
                    : gfx?.createRect().h(80).w(160).fill(colorToHex(this.bankColors.get(selections[i] as DropBank)!)!) ?? {fill() { }} as any,
                collect: () => this.selectBank(selections[i]==='random'? undefined  : (selections[i] as DropBank)),
                made: () => {
                    switch (verb[i]) {
                        case 'ADD 50K TO': this.value += 50000; break;
                        case 'ADD 500K TO': this.value += 500000; break;
                        case 'DOUBLE': this.value *= 2; break;
                        case 'TRIPLE': this.value *= 3; break;
                        case '1.5X': this.value *= 1.5; break;
                    }
                },
            };
        }), { award: 'plunge to choose bank'}];
    }
}