import { Mode, Modes } from '../mode';
import { MachineOutputs, machine } from '../machine';
import { SkillShotGfx } from '../gfx/skillshot';
import { State } from '../state';
import { Outputs } from '../outputs';
import { screen, makeText, alert, gfx } from '../gfx';
import { onAnyPfSwitchExcept, onSwitchClose, onAnySwitchClose, Switch } from '../switch-matrix';
import { wrap, assert } from '../util';
import { Text } from 'aminogfx-gl';
import { Player } from './player';
import { Log } from '../log';
import { time } from '../timer';
import { Events, Priorities } from '../events';
import { fork } from '../promises';
import { Ball } from './ball';


export class Skillshot extends Mode<MachineOutputs> {
    shooterOpen = true;

    awards: [string, string, number, () => void][] = [
        ['right inlane', '1,00 points', 100, () => this.player.score += 100],
        ['lower magnet switch', '1,000 points', 600, () => this.player.score += 1000],
        ['upper magnet switch', '300 points', 800, () => this.player.score += 300],
        ['upper lanes', '500 points', 200, () => this.player.score += 500],
        ['lower lanes', '400 points', 400, () => this.player.score += 400],
        ['upper eject hole', '5,000 points', 500, () => this.player.score += 5000],
        ['left inlane', '2,000 points', 25, () => this.player.score += 2000],
    ];
    curAward = 0;
    displays: Text[] = [];

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
          

        const outs = {} as any;
        for (const a of this.awards) {
            if (gfx)
                this.displays.push(makeText(`${a[2]}`, 70, 'corner').rz(90).x(80).y(160).sy(-1));
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
        this.listen(onAnySwitchClose(machine.sUpperLaneLeft, machine.sUpperLaneRight, machine.sBackLane), () => this.made(3));
        this.listen(onAnySwitchClose(machine.sLowerLaneCenter, machine.sLowerLaneRight, machine.sLowerLaneLeft), () => this.made(4));
        this.listen(onAnySwitchClose(machine.sUpperEject), () => this.made(5));
        this.listen(onAnySwitchClose(machine.sLeftInlane, machine.sLeftOrbit), () => this.made(6));

        this.listen(onAnyPfSwitchExcept(machine.sShooterLane, machine.sShooterLower, machine.sShooterUpper, machine.sShooterMagnet), 'finish');

        this.listen(onSwitchClose(machine.sPopperButton), () => this.setAward(this.curAward+1));
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
        i = wrap(i, this.awards.length);
        this.displays[this.curAward].fill('#ffffff');
        this.curAward = i;
        this.displays[this.curAward].fill('#ffff00');
        Log.info('game', 'selected skillshot %i', i);
    }

    made(i: number) { 
        Log.log('game', 'skillshot %i', i);
        if (i === this.curAward) {
            this.awards[i][3]();
            alert('SKILLSHOT!', undefined, this.awards[i][1]);
        }
        if (this.player.poker)
            this.player.poker.bet = this.awards[i][2];
        this.wasMade = true;
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
}