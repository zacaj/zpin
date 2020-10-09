import { Mode, Modes } from '../mode';
import { MachineOutputs, machine, SkillshotAward } from '../machine';
import { SkillShotGfx } from '../gfx/skillshot';
import { State } from '../state';
import { Outputs } from '../outputs';
import { screen, makeText, alert, pfx, addToScreen } from '../gfx';
import { onAnyPfSwitchExcept, onSwitchClose, onAnySwitchClose, Switch, onSwitchOpen, SwitchEvent } from '../switch-matrix';
import { wrap, assert, comma } from '../util';
import { Text, Node } from 'aminogfx-gl';
import { Player } from './player';
import { Log } from '../log';
import { time } from '../timer';
import { Events, Priorities, Event } from '../events';
import { fork } from '../promises';
import { Ball } from './ball';
import { Rng } from '../rand';

enum GateMode {
    Closed = 'Closed',
    Open = 'Open',
    Toggle = 'Toggle',
}

export class Skillshot extends Mode {
    shooterOpen = true;

    awards!: SkillshotAward[];
    curAward = 0;
    displays: Node[] = [];

    wasMade = false;

    lastSw = 0;
    switches = [machine.sShooterLower, machine.sShooterMagnet, machine.sShooterUpper];
    startTime = time();

    gateMode!: GateMode;

    finishDisplay?: () => void;

    rng!: Rng;

    private constructor(
        public player: Player,
        public ball: Ball,
    ) {
        super(Modes.Skillshot);
        this.rng = player.rng();
        State.declare<Skillshot>(this, ['shooterOpen', 'curAward', 'gateMode']);
        player.storeData<Skillshot>(this, ['rng']);

        this.awards = this.makeAwards();          

        const outs = {} as any;
        for (const a of this.awards) {
            if (pfx && !a.display)
                this.displays.push(makeText('', 10, undefined, undefined, pfx));
            else if (pfx && a.display)
                this.displays.push((typeof a.display === 'string'?  makeText(a.display, 70, 'corner', undefined, pfx) : a.display).rz(90).x(80).y(160).sy(-1));
            else
                this.displays.push({fill() { }} as any);
            outs[`iSS${this.awards.indexOf(a)+1}`] = this.displays.last();
        }

        if (player.game.ballNum === 1)
            this.gateMode = GateMode.Closed;
        else
            this.gateMode = this.rng.weightedSelect([2, GateMode.Closed], [8, GateMode.Toggle], [4, GateMode.Closed]);

        this.out = new Outputs(this, {
            ...outs,
            shooterDiverter: () => this.shooterOpen,
            leftGate: () => this.gateMode===GateMode.Toggle? (time()-this.startTime) % 3000 > 1500 : (this.gateMode===GateMode.Open),
            rightGate: false,
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
        this.listen(onAnySwitchClose(...machine.sUpperLanes), (e) => this.made(3, e));
        this.listen(onAnySwitchClose(machine.sUpperEject), (e) => this.made(4, e));
        this.listen(onAnySwitchClose(machine.sLeftInlane), (e) => this.made(5, e));

        this.listen<SwitchEvent>([
            ...onAnyPfSwitchExcept(machine.sOuthole, machine.sShooterLane, machine.sShooterLower, machine.sShooterUpper, machine.sShooterMagnet),
            e => !machine.out!.treeValues.ignoreSkillsot.has(e.sw),
        ], 'finish');

        this.listen(onSwitchClose(machine.sOuthole), 'end');

        this.listen([...onSwitchOpen(machine.sRightFlipper), () => time() - machine.sRightFlipper.lastClosed! < 300 && machine.sShooterLane.state], () => this.setAward(this.curAward+1));
        this.listen([...onSwitchClose(machine.sLeftFlipper), () => machine.sShooterLane.state], () => this.setAward(this.curAward-1));


        addToScreen(() => new SkillShotGfx(this));
    }

    static async start(ball: Ball) {
        const finish = await Events.tryPriority(Priorities.Skillshot);
        if (!finish) return false;

        const skillshot = new Skillshot(ball.player, ball);
        skillshot.finishDisplay = finish;
        assert(!ball.skillshot);
        ball.skillshot = skillshot;
        skillshot.started();
        return skillshot;
    }

    setAward(i: number) {
        const select = (a: SkillshotAward, selected: boolean, i: number) => {
            if (!a.display) return;
            if (a.select)
                a.select(selected, a.display as any, a);
            const disp = this.displays[i];
            if (disp instanceof Text) {
                if (selected)
                    disp.fill('#ffff00');
                else
                    disp.fill('#ffffff');
            }
        };
        i = wrap(i, this.awards.length-1);
        select(this.awards[this.curAward], false, this.curAward);        
        this.curAward = i;
        select(this.awards[this.curAward], true, this.curAward);
        Log.info('game', 'selected skillshot %i', i);
    }

    made(i: number, e: SwitchEvent) { 
        Log.log('game', 'skillshot %i', i);
        if (i === this.curAward) {
            this.awards[i].made(e);
            alert('SKILLSHOT!', undefined, this.awards[i].award);
        }
        if (this.awards[i].collect)
            this.awards[i].collect!(e);
        this.wasMade = true;
        Events.fire(new SkillshotEomplete(i, i === this.curAward));
    }

    finish(e: SwitchEvent) {
        if (!this.wasMade) {
            this.made(this.lastSw, e);
        }
        return this.end();
    }

    end() {
        if (this.finishDisplay)
            this.finishDisplay();
        this.ball.skillshot = undefined;
        return super.end();
    }

    makeAwards(): SkillshotAward[] {
        const generic = this.getGenericAwards();
        const current = machine.out!.treeValues.getSkillshot? machine.out!.treeValues.getSkillshot() : [];
        const awards: SkillshotAward[] = [];
        for (let i=0; i<7; i++) {
            const cur = current[i];
            const gen = generic[i];
            awards.push({
                ...gen ?? {},
                ...cur ?? {},
                collect: (e) => {
                    if (cur?.collect)
                        cur.collect!(e);
                },
                made: (e) => {
                    if (cur?.made)
                        cur.made(e);
                    if (!cur?.award)
                        gen.made(e);
                },
            });
        }
        return awards;
    }

    getGenericAwards(): SkillshotAward[] {
        const base = 10000;
        const switches = ['right inlane','lower magnet switch','upper magnet switch','upper lanes','upper eject hole','left inlane'];
        const mults = [
            [[1, 1]],
            [[10, 5, 8], [10, 10, 15], [5, 30]],
            [[1, 3, 6]],
            this.gateMode===GateMode.Closed? [[10, 1, 5], [3, 4, 8]] : 
                (this.gateMode===GateMode.Open? [[10, 5, 9], [3, 8, 12]] : [[10, 3, 7], [3, 4, 10]]),
            this.gateMode===GateMode.Closed? [[1, 10], [2, 20], [5, 40]] : 
                (this.gateMode===GateMode.Open? [[5, 10], [2, 20], [1, 40]] : [[2, 10], [2, 20], [1, 40]]),
            this.gateMode===GateMode.Closed? [[1, 10, 15]] : 
                (this.gateMode===GateMode.Open? [[1, 1, 5]] : [[1, 4, 8]]),
        ];
        return switches.map((sw, i) => {
            const value = base * this.rng.weightedRange(...mults[i] as any);
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