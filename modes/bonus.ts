import { Node, Text } from 'aminogfx-gl';
import { dClear } from '../disp';
import { DropBank } from '../drop-bank';
import { Event, Events } from '../events';
import { addToScreen, alert, gfx, gWait, makeText, ModeGroup, Screen } from '../gfx';
import { GameGfx } from '../gfx/game';
import { Color, colorToArrow } from '../light';
import { machine } from '../machine';
import { Mode, Modes } from '../mode';
import { Outputs } from '../outputs';
import { fork } from '../promises';
import { playSound, stopMusic, stopSounds } from '../sound';
import { State } from '../state';
import { time } from '../timer';
import { comma, round, score, short } from '../util';
import { Ball } from './ball';

export class Bonus extends Mode {
    readonly bankColors = new Map<DropBank, Color>([
        [machine.centerBank, Color.Orange],
        [machine.upper2Bank, Color.White],
        [machine.rightBank, Color.Yellow],
        [machine.leftBank, Color.Green],
        [machine.upper3Bank, Color.Pink],
    ]);
    
    lines: [string, string?][] = [];
    total = 0;

    topTotal = 0;
    bottomTotal = 0;

    lastLine?: string;

    constructor(
        public ball: Ball,
        public bonusX = ball.bonusX,
    ) {
        super(Modes.Bonus);
        State.declare<Bonus>(this, ['lines', 'total', 'lastLine']);
        ball.player.storeData<Bonus>(this, ['topTotal', 'bottomTotal']);
        const outs: any  = {};
        for (const target of machine.dropTargets) {
            if (!target.image) continue;
            outs[target.image.name] = () => this.lastLine==='Drops'? colorToArrow(target.num%2? Color.Yellow : Color.White) :
                                            this.lastLine==='Banks'? colorToArrow(this.bankColors.get(target.bank)) :
                                            dClear(Color.Black);
        }
        for (const light of machine.lights) {
            outs[light.name] = [];
        }
        this.out = new Outputs(this, {
            ...outs,
            kickerEnable: false,
            outhole: false,
            troughRelease: false,
            rampUp: false,
            shooterDiverter: false,
            leftGate: false,
            rightGate: false,
            music: null,
            lLaneLower1: () => this.lastLine==='Lanes'? [Color.Green] : [],
            lLaneLower2: () => this.lastLine==='Lanes'? [Color.Green] : this.lastLine==='Slings'? [Color.Red] : [],
            lLaneLower3: () => this.lastLine==='Lanes'? [Color.Green] : this.lastLine==='Slings'? [Color.Red] : [],
            lLaneLower4: () => this.lastLine==='Lanes'? [Color.Green] : [],
            lLaneUpper1: () => this.lastLine==='Lanes'? [Color.Green] : this.lastLine==='Bonus X'? [Color.Pink] : [],
            lLaneUpper2: () => this.lastLine==='Lanes'? [Color.Green] : this.lastLine==='Bonus X'? [Color.Pink] : [],
            lLaneUpper3: () => this.lastLine==='Lanes'? [Color.Green] : this.lastLine==='Bonus X'? [Color.Pink] : [],
            lLaneUpper4: () => this.lastLine==='Lanes'? [Color.Green] : this.lastLine==='Bonus X'? [Color.Pink] : [],
            lRampArrow: () => this.lastLine==='Ramps'? [Color.Blue] : [],
            lFlushStatus: () => this.lastLine==='Multiballs'? [Color.Purple] : [],
            lStraightStatus: () => this.lastLine==='Multiballs'? [Color.Purple] : [],
            lFullHouseStatus: () => this.lastLine==='Multiballs'? [Color.Purple] : [],
        });

        addToScreen(() => new BonusGfx(this));
    }

    override started() {
        fork(this.run());
        return super.started();
    }

    async run() {
        // if (!this.ball.tilted) 
        // await gWait(500, 'bonus start');
        await this.addLine('Drops', 1500, this.ball.drops);
        await this.addLine('Banks', 7500, this.ball.banks);
        await this.addLine('Slings', 100, this.ball.slings);
        await this.addLine('Lanes', 1500, this.ball.lanes);
        await this.addLine('Ramps', 10000, this.ball.ramps);
        await this.addLine('Multiballs', 50000, this.ball.multiballs);
        // await this.addLine('Targets', 2500, this.ball.targets);
        if (this.bonusX>1) {
            // if (!this.ball.tilted) 
                await gWait(500, 'bonus x');
            this.lines.push([`BONUS X: ${1}`]);
            this.lastLine = 'Bonus X';
            const singleBonus = this.total;
            let x = 1;
            while (x < this.bonusX) {
                if (!this.ball.tilted) void playSound('rattle thunk');
                if (!this.ball.tilted) await gWait(600, 'bonus x');
                x++;
                this.total = singleBonus * x;
                this.lines.pop();
                this.lines.push([`BONUS X: ${x}`]);
            }
            if (!this.ball.tilted) void playSound('rattle thunk');
            await gWait(1000, 'bonus x');
            // if (!this.ball.tilted) 
        }
        this.ball.player.audit('bonus '+this.bonusX+'x');
        const initialTotal = this.total;
        if (!this.ball.tilted && this.total > this.topTotal)
            this.topTotal = this.total;
        if (this.ball.tilted && this.total > this.bottomTotal)
            this.bottomTotal = this.total;

        this.lastLine = undefined;

        if (!this.ball.tilted) {
            this.lines.push([`Total: ${score(this.total)}`]);
            if (!this.ball.tilted) void playSound('long rattle thunk');
            await gWait(1000, 'bonus total');

            this.ball.player.recordScore(this.total, 'bonus');
            const start = new Date().getTime();
            const speed = 25;
            const maxTime = 4000;
            const rate = Math.max(500, round(Math.abs(this.total)/(maxTime/speed), 1000));
            let dropTime = 500;
            let lastDrop = 0;
            let drops = 0;
            let dropCount = 3;
            console.log('bonus raw rate', Math.abs(this.total)/(maxTime/speed));
            while (this.total > 0) {
                if (!this.ball.tilted && time() - lastDrop > Math.min(350, dropTime)) {
                    if (this.total/speed/rate > .300) {
                        lastDrop = time();
                        void playSound('chip drop');
                        if (++drops === dropCount) {
                            dropTime /= 2;
                            drops = 0;
                            dropCount *= 2;
                        }
                    }
                }
                const change = Math.min(this.total, rate);
                this.total -= change;
                this.ball.player.addScore(change, null);
                await gWait(speed, 'bonus count');
            }
            console.log('bonus time %i for %i', new Date().getTime()-start, initialTotal);
        }
        // alert(`bonus took ${new Date().getTime()-start}`);
        // await gWait(1000, 'bonus end');
        // this.total = initialTotal;
        await gWait(2000, 'bonus end');
        // if (this.ball.tilted) 
        this.end();
    }

    async addLine(left: string, value: number, count: number, wait = 750) {
        this.lastLine = count? left : undefined;
        if (!count) return;
        const total = value * count;
        this.lines.push([left+`: ${comma(count, Math.max(5-left.length+3, 0))}`, `* ${short(value)} = ${short(total, 4)}`]);
        this.total += total;
        this.ball.player.audit('bonus '+left, total);
        if (!this.ball.tilted) void playSound('thunk');
        // if (!this.ball.tilted)
            await gWait(wait, 'bonus');
    }

    override end() {
        this.ball.bonus = undefined;
        Events.fire(new BonusEnd(this));
        return super.end();
    }
}

export class BonusGfx extends ModeGroup {
    constructor(
        public bonus: Bonus,
    ) {
        super(bonus);
        this.z(bonus.gPriority);
        const top = -Screen.h/2+GameGfx.top;

        // background
        const r = gfx.createRect().fill('#777777').z(-.1).w(Screen.w).h(GameGfx.main).y(top).x(-Screen.w/2);
        this.add(r);

        const bonusText = makeText('BONUS', 80, 'center', 'top').y(top);
        bonus.watch(() => bonusText.text(`BONUS${bonus.ball.tilted?' lost':''}: ${comma(bonus.total, 5)}`));
        this.add(bonusText);

        const lines = gfx.createGroup();
        this.add(lines);

        bonus.watch(() => {
            lines.clear();
            let y = top + bonusText.fontSize()*1.25;
            for (const [left, right] of bonus.lines) {
                let l: Text;
                if (right) {
                    l = makeText(left, 50, 'left', 'top').x(-Screen.w/2*.75).y(y);
                    const r = makeText(right, 50, 'right', 'top').x(Screen.w/2*.75).y(y);
                    lines.add(l, r);
                } else {
                    l = makeText(left, 50, 'center', 'top').y(y);
                    lines.add(l);
                }
                y += l.fontSize()*1.25;
            }
        });
    }
}

export class BonusEnd extends Event {
    constructor(
        public bonus: Bonus,
    ) {
        super();
    }
}