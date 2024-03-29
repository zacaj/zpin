import { Mode, Modes } from '../mode';
import { MachineOutputs, machine, SkillshotAward, MusicType, ImageType } from '../machine';
import { SkillShotGfx } from '../gfx/skillshot';
import { State } from '../state';
import { Outputs } from '../outputs';
import { screen, makeText, alert, pfx, addToScreen } from '../gfx';
import { onAnyPfSwitchExcept, onSwitchClose, onAnySwitchClose, Switch, onSwitchOpen, SwitchEvent } from '../switch-matrix';
import { wrap, assert, comma, range, seq, rangeSelect } from '../util';
import { Text, Node } from 'aminogfx-gl';
import { Player } from './player';
import { Log } from '../log';
import { time, wait } from '../timer';
import { Events, Priorities, Event, onAny } from '../events';
import { fork } from '../promises';
import { Ball } from './ball';
import { Rng } from '../rand';
import { playMusic, playSound, playVoice, stopMusic } from '../sound';
import { AddABall, Combo } from '../util-modes';
import { dClear, dFlash, dImage, dInvert, DisplayContent, dMany } from '../disp';
import { Color } from '../light';

export enum GateMode {
    Closed = 'Closed',
    Open = 'Open',
    Toggle = 'Toggle',
}

const skillSuffix = ['_v', '_h', '', '_h', '_h', ''];

export class Skillshot extends Mode {
    shooterOpen = true;

    awards!: SkillshotAward[];
    curAward = 0;

    wasMade = false;

    lastSw = -1;
    switches = [machine.sShooterLower, machine.sShooterMagnet, machine.sShooterUpper];
    startTimestamp = time();

    gateMode!: GateMode;

    finishDisplay?: () => void;

    rng!: Rng;
    skillshotCount = 0;

    static isShootAgain?: Ball;
    static ballInPlay?: Ball;

    isFirstOfBall = false;

    music?: MusicType = null;

    wrong = false;

    timesTried = [0, 0, 0, 0, 0, 0];

    private constructor(
        public player: Player,
        public ball: Ball,
    ) {
        super(Modes.Skillshot);
        this.rng = player.rng();
        State.declare<Skillshot>(this, ['shooterOpen', 'curAward', 'gateMode', 'music']);
        player.storeData<Skillshot>(this, ['rng', 'skillshotCount', 'timesTried']);

        if (Skillshot.ballInPlay !== ball) 
            this.isFirstOfBall = true;

        this.awards = this.makeAwards();    
        this.gateMode = this.rng.weightedSelect([0, GateMode.Closed], [8, GateMode.Toggle], [4, GateMode.Open]);    
        
        this.setAward(this.rng.randSelect(...seq(6).filter(i => !this.awards[i].dontDefault)));//(Math.random()*this.awards.length)|0);  

        const outs = {} as any;
        let displays = 0;
        for (const a of this.awards) {
            const i = displays;
            displays++;
            outs[i!==1? `iSS${this.awards.indexOf(a)+1}` : 'iSpinner'] = (prev: ImageType) => {
                const disp = a.display ?? (i===this.curAward? dImage('skill_plunge'+(i===1?'_2':'')) : dClear());
                const d = i===this.curAward? 
                    dFlash(disp, 100, 300)
                    // (((time()/800%2)|0)===0? dMany(disp, dImage("skill_selected")) : dImage('skill_plunge'+(i===1?'_2':'')))
                  : {...disp};
                if (d.images)
                    d.images = d.images.map(img => img+skillSuffix[i]);
                return d;
            };
        }

        const wasSilent = !machine.oMusic.actual;

        // if (player.game.ballNum === 1)
        //     this.gateMode = GateMode.Closed;
        // else

        this.out = new Outputs(this, {
            ...outs,
            shooterDiverter: () => this.shooterOpen,
            leftGate: () => this.gateMode===GateMode.Toggle? (time()-this.startTimestamp) % 3000 > 1500 : (this.gateMode===GateMode.Open),
            rightGate: false,
            upperMagnet: () => this.curAward===1 && machine.sShooterMagnet.lastClosed && time() - machine.sShooterMagnet.lastClosed < 3000 && this.lastSw < 2,
            music: (prev) => wasSilent? (!this.music? prev? [typeof prev==='string'? prev:prev[0], false] : undefined : [this.music, false]) : undefined,
            enableSkillshot: false,
        });


        this.listen([...onAnyPfSwitchExcept(machine.sShooterLane), () => !machine.sShooterLane.state], () => this.shooterOpen = false);
        this.listen(onSwitchClose(machine.sShooterLane), () => this.shooterOpen = true);

        this.listen(onAnySwitchClose(machine.sShooterLower, machine.sShooterUpper, machine.sShooterMagnet), e => {
            const index = this.switches.indexOf(e.sw);
            if (index > this.lastSw)
                this.lastSw = index;
            else if (index >= this.lastSw-1)
                return this.finish(e);
            if (this.curAward < index && !this.wrong) {
                void playSound('wrong');
                this.wrong = true;
            }
        });
        this.listen(onAnySwitchClose(...machine.sUpperLanes), (e) => this.made(3, e));
        this.listen(onAnySwitchClose(machine.sUpperEject), (e) => this.made(4, e));
        this.listen(onAnySwitchClose(machine.sLeftInlane), (e) => this.made(5, e));

        if (this.isFirstOfBall)
            this.listen([...onSwitchClose(machine.sShooterLane), () => (machine.sShooterLane.lastOpened??0) > this.startTime], () => this.music = 'green grass intro a end');
        this.listen(onSwitchOpen(machine.sShooterLane), () => this.music = 'green grass intro a');

        this.listen<SwitchEvent>([onAny(
            onAnyPfSwitchExcept(machine.sShooterLane, machine.sShooterLower, machine.sShooterUpper, machine.sShooterMagnet),
            onSwitchClose(machine.sSpinner),
        ),
            e => !machine.out!.treeValues.ignoreSkillsot.has(e.sw),
            () => !machine.sShooterLane.state,
        ], e => {
            Log.info('game', 'skillshot ended by playfield switch %s', e.sw.name);
            return this.finish(e);
        });

        // this.listen(onSwitchClose(machine.sOuthole), 'end');

        this.listen([...onSwitchOpen(machine.sRightFlipper), () => time() - machine.sRightFlipper.lastClosed! < 350 && machine.sShooterLane.state], () => this.setAward(this.curAward+1));
        this.listen([...onSwitchClose(machine.sLeftFlipper), () => machine.sShooterLane.state], () => this.setAward(this.curAward-1));


        addToScreen(() => new SkillShotGfx(this));
    }

    static async start(ball: Ball) {
        if (!machine.out!.treeValues.enableSkillshot) return false;
        // return;
        // if (machine.getChildren().find(x => 'isAddABall' in x)) return;
        const finish = await Events.tryPriority(Priorities.Skillshot);
        if (!finish) return false;

        const skillshot = new Skillshot(ball.player, ball);
        if (skillshot.isFirstOfBall)
            void stopMusic();
        // skillshot.finishDisplay = finish;
        assert(!ball.skillshot);
        if (Skillshot.isShootAgain === ball) {
            void playVoice('shoot the ball carefully');
        }
        else if (ball.player.game.ballNum === 1 && skillshot.isFirstOfBall)
            void playVoice('choose your skillshot');
        else {
            const options = ['shoot carefully', 'plunge carefully', 'choose wisely'];
            if (!skillshot.isFirstOfBall)
                options.push('this shot requires skill');
            void playVoice(options);
        }
        Skillshot.isShootAgain = undefined;
        Skillshot.ballInPlay = ball;
        ball.skillshot = skillshot;
        skillshot.started();
        finish();
        return skillshot;
    }

    setAward(i: number) {
        const select = (a: SkillshotAward, selected: boolean, i: number) => {
            if (!a.display) return;
            if (a.select)
                a.select(selected, a.display as any, a);
        };
        i = wrap(i, this.awards.length-1);
        select(this.awards[this.curAward], false, this.curAward);        
        this.curAward = i;
        select(this.awards[this.curAward], true, this.curAward);
        Log.info('game', 'selected skillshot %i', i);
    }

    async made(i: number, e: SwitchEvent) { 
        if (machine.sShooterLane.state) {
            Log.error(['switch', 'game'], 'Switch %s detected while ball in shooter lane', e.sw.name);
            return;
        }
        Log.log('game', 'skillshot %i', i);
        this.music = null;
        if (i === this.curAward) {
            alert('SKILLSHOT!', undefined, this.awards[i].award);
            this.awards[i].made(e);
            this.skillshotCount++;

            if (this.curAward===1 && e.sw===machine.sSpinner) {
                fork(Combo(this.player, machine.sUpperEject, machine.lLeftArrow, 100000));
            }
            if (this.curAward===4) {
                fork(Combo(this.player, machine.sBackLane, machine.lUpperLaneArrow, 100000));
            }
        }
        else if (!this.wrong) {
            void playSound('wrong');
            this.wrong = true;
        }
        if (this.awards[i].collect)
            this.awards[i].collect!(e);
        this.wasMade = true;
        Events.fire(new SkillshotComplete(i, i === this.curAward));
        this.player.audit(`skillshot to ${i}`);
        this.player.audit(`skillshot attempted ${this.curAward}`);


        // void wait(1000).then(() => this.music('green grass main'));
        await wait(1000);
        this.music = undefined; // [machine.ballsInPlay>1? 'green grass solo with start' : 'green grass main', false];
        await wait(50);
    }

    async finish(e: SwitchEvent) {
        if (machine.sShooterLane.state) {
            Log.error(['switch', 'game'], 'Switch %s detected while ball in shooter lane', e.sw.name);
            return;
        }
        if (this.wasMade) return;
        this.timesTried[this.curAward]++;
        if ([machine.sLeftOutlane, machine.sRightOutlane, machine.sOuthole, machine.sMiniOut].includes(e.sw)) {
            void playVoice(`wait you'll get that back`, 75, true);
            this.ball.shootAgain = true;
            Skillshot.isShootAgain = this.ball;
        } else if (!this.wasMade) {
            if (this.lastSw === -1) // && e.sw === machine.sRightInlane)
                this.lastSw = 0;
            await this.made(this.lastSw, e);
        }
        return this.end();
    }

    override end() {
        if (this.finishDisplay)
            this.finishDisplay();
        this.ball.skillshot = undefined;
        return super.end();
    }

    // eslint-disable-next-line complexity
    makeAwards(): SkillshotAward[] {
        const generic = this.getGenericAwards();
        const current = machine.out!.treeValues.getSkillshot? machine.out!.treeValues.getSkillshot(this) : [];
        const awards: SkillshotAward[] = [];
        const nRand = this.rng.weightedRand(30, 60, 30, 5)+(this.isFirstOfBall? 2:0);
        const randInds = seq(nRand).map(() => this.rng.randRange(1, 4));
        randInds.push(4);
        let max = Math.max(...this.timesTried);
        if (this.timesTried.filter(t => t === max).length > 3) max++;
        for (let i=0; i<7; i++) {
            const gen = generic[i];
            const rand = (!current[i]?.dontOverride && randInds.includes(i) && this.timesTried[i]<max)?
                this.rng.weightedSelect<SkillshotAward>(...([
                    [rangeSelect(this.player.store.Poker!.cashValue, [200, 25], [350, 15], [0, 3]), {
                        switch: gen.switch,
                        award: '+50 $ value',
                        made: () => this.player.changeValue(50),
                    }],
                    [rangeSelect(this.player.store.Poker!.cashValue, [200, 50], [350, 30], [0, 10]), {
                        switch: gen.switch,
                        award: '+25 $ value',
                        made: () => this.player.changeValue(25),
                    }],
                    [18-(5-i), {
                        switch: gen.switch,
                        award: '$500',
                        made: () => {
                            void playSound('cash');
                            this.player.store.Poker!.bank+=500;
                        },
                    }],
                    [7-(5-i), {
                        switch: gen.switch,
                        award: '$1000',
                        made: () => {
                            void playSound('cash');
                            this.player.store.Poker!.bank+=1000;
                        },
                    }],
                    [24-this.player.chips*8, {
                        switch: gen.switch,
                        award: `+${3-this.player.chips} cheats`,
                        made: () => seq(3-this.player.chips).forEach(() => this.player.addChip()),
                    }],
                    [(this.player.poker?.step??0)>2? 20:0, {
                        switch: gen.switch,
                        award: 'UNDO ONE CARD',
                        made: () => this.player.poker!.snail(),
                    }],
                    [(this.player.poker?.step??0)>3? 15:0, {
                        switch: gen.switch,
                        award: 'UNDO TWO CARDS',
                        made: () => seq(2).forEach(() => this.player.poker!.snail()),
                    }],
                    [this.player.mbsQualified.size===0 && !this.player.curMbMode && [this.player.straightMbStatus, this.player.flushMbStatus, this.player.fullHouseMbStatus].truthy().length<=1? 10 : 0, {
                        switch: gen.switch,
                        award: 'LIGHT MULTIBALL',
                        made: () => this.player.qualifyMb(['StraightMb', 'FullHouseMb', 'FlushMb'].find(m => !this.player.mbsQualified.has(m as any)) as any),
                    }],
                    [i===4 && machine.ballsInPlay<=1 && machine.ballsLocked<1 && !this.player.curMbMode && this.player.mysteryLeft? 15 : 0, {
                        switch: gen.switch,
                        award: 'ADD A BALL',
                        made: () => AddABall(this.player.overrides),
                    }],
                ] as [number, SkillshotAward][]).filter((a) => !awards.some(b => b.award === a[1].award)),
                ) : undefined;
            const cur = this.timesTried[i]<max || current[i]?.dontOverride? {...current[i], ...(current[i]?.dontOverride? {} : rand)} : undefined;
            awards.push({
                ...gen ?? {},
                ...cur ?? {},
                award: cur?.award ?? gen?.award ?? 'NOTHING',
                collect: (e) => {
                    if (cur?.collect)
                        cur.collect!(e);
                },
                made: (e) => {
                    let excite = false;
                    if (rand) excite = true;
                    if (i===2 || i===4) excite = true;
                    if (i>=3 && this.gateMode!==GateMode.Closed) excite = true;
                    if (excite && Math.random()>.7) excite = false;
                    void playVoice(`skillshot${excite? '!':''}`);
                    // void playSound(`skillshot${excite? '!':''}`);

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
        const base = 10000 + Math.floor(this.player.score/1000000)*5000;
        const switches = ['first switch','second switch','third switch','upper lanes','upper eject hole','left inlane'];
        const mults = [
            [[1, 1]],
            [[10, 3, 5], [10, 5, 10], [5, 15]],
            [[1, 3, 6]],
            this.gateMode===GateMode.Closed? [[10, 1, 5], [3, 4, 8]] : 
                (this.gateMode===GateMode.Open? [[10, 5, 9], [3, 8, 12]] : [[10, 3, 7], [3, 4, 10]]),
            this.gateMode===GateMode.Closed? [[1, 10], [2, 20], [5, 40]] : 
                (this.gateMode===GateMode.Open? [[5, 10], [2, 20], [1, 40]] : [[2, 10], [2, 20], [1, 40]]),
            this.gateMode===GateMode.Closed? [[1, 10, 15]] : 
                (this.gateMode===GateMode.Open? [[1, 1, 5]] : [[1, 4, 8]]),
        ];
        let max = Math.max(...this.timesTried);
        if (this.timesTried.filter(t => t === max).length > 3) max++;
        return switches.map((sw, i) => {
            const value = base * this.rng.weightedRange(...mults[i] as any) * (this.timesTried[i]>=max? 0.5 : 1);
            return {
                award: comma(value)+' points',
                switch: sw,
                made: () => this.player.score += value,
            };
        });
    }
}

export class SkillshotComplete extends Event {
    constructor(
        public skillshot: number,
        public made: boolean,
    ) {
        super();
    }
}