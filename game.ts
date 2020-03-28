import { SwitchEvent, onSwitchClose } from './switch-matrix';
import { Events, onType, Event } from './events';
import { State, StateEvent, onChange, Tree } from './state';
import { machine, MachineOutputs } from './machine';
import { Mode } from './mode';
import { Outputs, toggle } from './outputs';
import { time } from './timer';

// eslint-disable-next-line no-undef
export class Game extends Mode<Pick<MachineOutputs, 'upper3'|'rampUp'>> {
    rampUp = true;
    lowerRampLit = false;    

    private constructor() {
        super();
        State.declare<Game>(this, ['rampUp', 'lowerRampLit']);

        this.out = new Outputs(this, {
            upper3: toggle({
                on: () => machine.sUpper3.every(sw => sw.onFor(250)),
                off: () => machine.sUpper3.every(sw => sw.offFor(250)),
            }),
            rampUp: () => this.rampUp,
        });

        Events.listen(e => {
            if (this.lowerRampLit)
                this.rampUp = false;
        }, onSwitchClose(machine.sRightInlane));
        Events.listen(e => this.lowerRampLit = !this.lowerRampLit, onSwitchClose(machine.sShooterLower));
        Events.listen(e => this.rampUp = true, onSwitchClose(machine.sPop));
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