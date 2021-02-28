import { argv } from 'yargs';
import { Game } from './game';
import { addToScreen, makeText, ModeGroup, Screen } from './gfx';
import { initMachine } from './init';
import { Color } from './light';
import { Log } from './log';
import { machine } from './machine';
import { Mode, Modes } from './mode';
import { Outputs } from './outputs';
import { fork } from './promises';
import { onSwitchClose } from './switch-matrix';
import { money, score } from './util';
import { ClearHoles } from './util-modes';

export class AttractMode extends Mode {

    clearHoles = new ClearHoles();

    get nodes() {
        return [this.clearHoles];
    }

    constructor(
        public scores?: [number, number][],
    ) {
        super(Modes.AttractMode);

        this.out = new Outputs(this, {
            lPower1: [[Color.White, 'fl', 1, 1]],
            lPower2: [[Color.White, 'fl', 1, 0]],
            lPower3: [[Color.White, 'fl', 1, 1]],
            lLaneLower1: [[Color.Yellow, 'fl', 1, 1]],
            lLaneLower2: [[Color.Yellow, 'fl', 1, 0]],
            lLaneLower3: [[Color.Yellow, 'fl', 1, 1]],
            lLaneLower4: [[Color.Yellow, 'fl', 1, 0]],
            lMagnet1: [[Color.Green, 'fl', 1, 1]],
            lMagnet2: [[Color.Green, 'fl', 1, 0]],
            lMagnet3: [[Color.Green, 'fl', 1, 1]],
            lShootAgain: [[Color.Purple, 'fl', 1, 1]],
            lPopperStatus: [[Color.Green, 'fl', 1, 0]],
            lRampArrow: [[Color.Blue, 'fl', 1, 0]],
            lMainTargetArrow: [[Color.Pink, 'fl', 1, 1]],
            lRampMini: [[Color.Orange, 'fl', 1, 1]],
            lLeftArrow: [[Color.Orange, 'fl', 1, 0]],
            lSideShotArrow: [[Color.White, 'fl', 1, 1]],
            lSideTargetArrow: [[Color.Red, 'fl', 1, 0]],
            lEjectArrow: [[Color.Yellow, 'fl', 1, 0]],
            lUpperLaneArrow: [[Color.Red, 'fl', 1, 1]],
            lUpperLaneTarget: [[Color.Orange, 'fl', 1, 0]],
            lUpperTargetArrow: [[Color.White, 'fl', 1, 1]],
            lSpinnerArrow: [[Color.Blue, 'fl', 1, 1]],
            lSpinnerTarget: [[Color.Orange, 'fl', 1, 0]],
            lLaneUpper1: [[Color.Orange, 'fl', 1, 0]],
            lLaneUpper2: [[Color.Orange, 'fl', 1, 1]],
            lLaneUpper3: [[Color.Orange, 'fl', 1, 0]],
            lLaneUpper4: [[Color.Orange, 'fl', 1, 1]],                        
        });

        addToScreen(() => new AttractGfx(this));

        this.listen(onSwitchClose(machine.sStartButton), async () => {
            const game = await Game.start(argv.seed as string ?? Math.random().toString());
        });
    }

    end() {
        machine.attract = undefined;
        return super.end();
    }

    static start() {
        Log.log(['console'], 'starting attract mode...');
        machine.attract = new AttractMode();
        machine.attract.started();
    }
}

if (require.main === module) {
fork(initMachine(true, true, false, false)).then(() => {
    
});
}

export class AttractGfx extends ModeGroup {
    constructor(
        public a: AttractMode,
    ) {
        super(a);
        this.z(a.gPriority);

        if (!a.scores)
            this.add(makeText('Attract Mode', 100, 'center'));
        else {
            this.add(makeText('Game Over', 100, 'center').y(-Screen.h*.3));
            let y = -Screen.h * .15;
            let i = 1;
            for (const [sc, bank] of a.scores) {
                this.add(makeText(`PLAYER ${i}:`, 50, 'left').x(-Screen.w*.4).y(y));
                this.add(makeText(`${score(sc)}  |  ${money(bank)}`, 50, 'right').x(Screen.w*.4).y(y));
                y += 75;
                i++;
            }
        }
    }
}