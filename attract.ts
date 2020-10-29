import { argv } from 'yargs';
import { Game } from './game';
import { addToScreen, makeText, ModeGroup, Screen } from './gfx';
import { initMachine } from './init';
import { Log } from './log';
import { machine } from './machine';
import { Mode, Modes } from './mode';
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

        addToScreen(() => new AttractGfx(this));

        this.listen(onSwitchClose(machine.sStartButton), async () => {
            const game = await Game.start(argv.seed as string ?? Math.random().toFixed());
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