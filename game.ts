import { SwitchEvent, onSwitchClose } from './switch-matrix';
import { Events, onType, Event } from './events';
import { State, StateEvent, onChange, Tree } from './state';
import { machine, MachineOutputs } from './machine';
import { Mode } from './mode';
import { Outputs, toggle } from './outputs';
import { time } from './timer';
import { ClearHoles, ResetAnyDropOnComplete } from './util-modes';

// eslint-disable-next-line no-undef
export class Game extends Mode/*<Pick<MachineOutputs, 'rampUp'|'troughRelease'>>*/ {
    rampUp = true;
    private constructor() {
        super();
        State.declare<Game>(this, ['rampUp']);

        this.out = new Outputs(this, {
            rampUp: () => this.rampUp,
            troughRelease: () => machine.sTroughFull.onFor(400),
        });

        Events.listen(e => {
            this.rampUp = false;
        }, onSwitchClose(machine.sRightInlane), () => machine.sShooterLower.wasClosedWithin(2000));
       Events.listen(e => this.rampUp = true, onSwitchClose(machine.sPop, machine.sLeftSling, machine.sRightSling));
       
       this.addChild(new ClearHoles());
       this.addChild(new ResetAnyDropOnComplete());
    }

    static start(): Game {
        const game = new Game();
        machine.addChild(game);
        return game;
    }
}

export class LockLit extends Mode<Pick<MachineOutputs, 'rampUp'>> {
    rampUp = false;

    constructor() {
        super();

        this.out = new Outputs(this, {
            rampUp: () => this.rampUp,
        });
    }
}

if (require.main === module) {
    console.info('starting game...');
    const game = Game.start();
}