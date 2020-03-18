import { SwitchEvent, onSwitchClose } from './switch-matrix';
import { Events, onType, Event } from './events';
import { State, StateEvent, onChange, Tree } from './state';
import { machine } from './machine';
import { makeOutputs } from './outputs';
import { time } from './util';
import { Mode } from './mode';


export class Game extends Mode {
    rampUp = true;
    lowerRampLit = false;

    out = makeOutputs({
        upper3: () => machine.sUpper3.every(sw => sw.state && time() > sw.lastChange + 250),
    }, this);

    constructor() {
        super();
        State.declare<Game>(this, ['rampUp', 'lowerRampLit']);
        Events.listen({onSwitch: this}, onType(SwitchEvent));

        Events.listen(e => {
            if (this.lowerRampLit)
                this.rampUp = false;
        }, onSwitchClose(machine.sRightInlane));
        Events.listen(e => this.lowerRampLit = !this.lowerRampLit, onSwitchClose(machine.sShooterLane2));
        Events.listen(e => this.rampUp = true, onSwitchClose(machine.sPopBumper));
    }

    static start(): Game {
        const game = new Game();
        machine.addChild(game);
        return game;
    }
}

export class LockLit extends Mode {
    rampUp = false;
}