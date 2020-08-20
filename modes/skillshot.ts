import { Mode, Modes } from '../mode';
import { MachineOutputs, machine, SkillshotAward } from '../machine';
import { SkillShotGfx } from '../gfx/skillshot';
import { State } from '../state';
import { Outputs } from '../outputs';
import { screen, makeText, alert, gfx } from '../gfx';
import { onAnyPfSwitchExcept, onSwitchClose, onAnySwitchClose, Switch, onSwitchOpen } from '../switch-matrix';
import { wrap, assert, comma } from '../util';
import { Text, Node } from 'aminogfx-gl';
import { Player } from './player';
import { Log } from '../log';
import { time } from '../timer';
import { Events, Priorities, Event } from '../events';
import { fork } from '../promises';
import { Ball } from './ball';


export class Skillshot extends Mode<MachineOutputs> {
    shooterOpen = true;

    awards!: SkillshotAward[];
    curAward = 0;
    displays: Node[] = [];

    wasMade = false;

    lastSw = 0;
    switches = [machine.sShooterLower, machine.sShooterMagnet, machine.sShooterUpper];
    startTime = time();

    finishDisplay?: () => void;

    private constructor(
        public player: Player,
    ) {
        super(Modes.Skillshot);

        State.declare<Skillshot>(this, ['shooterOpen', 'curAward']);

        this.awards = this.makeAwards();          

        const outs = {} as any;
        for (const a of this.awards) {
            if (gfx && !a.display)
                this.displays.push(makeText('', 10));
            else if (gfx && a.display)
                this.displays.push((typeof a.display === 'string'?  makeText(a.display, 70, 'corner') : a.display).rz(90).x(80).y(160).sy(-1));
            else
                this.displays.push({fill() { }} as any);
            outs[`iSS${this.awards.indexOf(a)+1}`] = this.displays.last();
        }

        this.out = new Outputs(this, {
            ...outs,
            shooterDiverter: () => this.shooterOpen,
            // leftGate: () => (time()-this.startTime) % 3000 > 1500,
            upperMagnet: () => machine.sShooterMagnet.lastClosed && time() - machine.sShooterMagnet.lastClosed < 5000 && this.lastSw < 2,
        });
        
        this.setAward(0);//(Math.random()*this.awards.length)|0);

        


        this.listen([...onAnyPfSwitchExcept(machine.sShooterLane), () => !machine.sShooterLane.state], () => this.shooterOpen = false);
        this.listen(onSwitchClose(machine.sShooterLane), () => this.shooterOpen = true);

        this.listen(onAnySwitchClose(machine.sShooterLower, machine.sShooterUpper, machine.sShooterMagnet), e => {
            const index = this.switches.indexOf(e.sw);
            if (index >= this.lastSw)
                this.lastSw = index;
        });
        this.listen(onAnySwitchClose(machine.sUpperLaneLeft, machine.sUpperLaneRight, machine.sBackLane), () => this.made(4));
        this.listen(onAnySwitchClose(machine.sLowerLaneCenter, machine.sLowerLaneRight, machine.sLowerLaneLeft), () => this.made(3));
        this.listen(onAnySwitchClose(machine.sUpperEject), () => this.made(5));
        this.listen(onAnySwitchClose(machine.sLeftInlane, machine.sLeftOrbit), () => this.made(6));

        this.listen(onAnyPfSwitchExcept(machine.sShooterLane, machine.sShooterLower, machine.sShooterUpper, machine.sShooterMagnet), 'finish');

        this.listen([...onSwitchOpen(machine.sPopperButton), () => time() - machine.sPopperButton.lastClosed! < 100], () => this.setAward(this.curAward+1));
        this.listen(onSwitchClose(machine.sMagnetButton), () => this.setAward(this.curAward-1));


        this.gfx?.add(new SkillShotGfx(this));
    }

    static async start(ball: Ball) {
        const finish = await Events.tryPriority(Priorities.Skillshot);
        if (!finish) return false;

        const skillshot = new Skillshot(ball.player);
        skillshot.finishDisplay = finish;
        assert(!ball.skillshot);
        ball.addChild(skillshot);
        return skillshot;
    }

    setAward(i: number) {
        const select = (a: SkillshotAward, selected: boolean) => {
            if (!a.display) return;
            if (a.select)
                a.select(selected, a.display as any, a);
            else if (a.display instanceof Text) {
                if (selected)
                    a.display.fill('#ffff00');
                else
                    a.display.fill('#ffffff');
            }
        };
        i = wrap(i, this.awards.length);
        select(this.awards[this.curAward], false);        
        this.curAward = i;
        select(this.awards[this.curAward], true);
        Log.info('game', 'selected skillshot %i', i);
    }

    made(i: number) { 
        Log.log('game', 'skillshot %i', i);
        if (i === this.curAward) {
            this.awards[i].made();
            alert('SKILLSHOT!', undefined, this.awards[i].award);
        }
        if (this.awards[i].collect)
            this.awards[i].collect!();
        this.wasMade = true;
        Events.fire(new SkillshotEomplete(i, i === this.curAward));
    }

    finish() {
        if (!this.wasMade) {
            this.made(this.lastSw);
        }
        return this.end();
    }

    end() {
        if (this.finishDisplay)
            this.finishDisplay();
        return super.end();
    }

    makeAwards(): SkillshotAward[] {
        const generic = this.getGenericAwards();
        const current = machine.out!.treeValues.getSkillshot? machine.out!.treeValues.getSkillshot() : [];
        const awards: SkillshotAward[] = [];
        for (let i=0; i<8; i++) {
            const cur = current[i];
            const gen = generic[i];
            awards.push({
                ...gen ?? {},
                ...cur ?? {},
                collect: () => {
                    if (cur?.collect)
                        cur.collect!();
                },
                made: () => {
                    if (cur?.made)
                        cur.made();
                    if (!cur.award)
                        gen.made();
                },
            });
        }
        return awards;
    }

    getGenericAwards(): SkillshotAward[] {
        const base = 10000;
        const switches = ['right inlane','lower magnet switch','upper magnet switch','lower lanes','upper lanes','upper eject hole','left inlane'];
        const mults = [
            [[1, 1]],
            [[10, 5, 8], [10, 10, 15], [5, 30]],
            [[1, 3, 6]],
            [[10, 3, 7], [20, 6, 14], [5, 30]],
            [[10, 1, 5], [3, 4, 8]],
            [[2, 10], [2, 20], [1, 40]],
            [[1, 1, 5]],
        ];
        return switches.map((sw, i) => {
            const value = base * this.player.weightedRange(...mults[i] as any);
            return {
                award: comma(value)+' points',
                switch: sw,
                made: () => this.player.score += base,
            };
        });
    }
}

export class SkillshotEomplete extends Event {
    constructor(
        public skillshot: number,
        public made: boolean,
    ) {
        super();
    }
}