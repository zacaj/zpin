import { SwitchEvent, onSwitchClose } from './switch-matrix';
import { Events, onType } from './events';
import { State, StateEvent, onChange, Tree } from './state';
import { Machine } from './machine';
import { Obj } from './util';

export class Mode implements Tree {
    children: Mode[] = [];
    parent?: Mode;

    addChild(mode: Mode) {
        if (mode.parent)
            mode.parent.removeChild(mode);
        mode.parent = this;
        this.children.push(mode);
    }
    removeChild(mode: Mode) {
        this.children.remove(mode);
        mode.parent = undefined;
    }
}

export class Game extends Mode {
    rampUp = true;
    lowerRampLit = false;

    constructor() {
        super();
        State.declare<Game>(this, ['rampUp']);
        Events.listen({onSwitch: this}, onType(SwitchEvent));

        Events.listen(e => {
            if (this.lowerRampLit)
                this.rampUp = false;
        }, onSwitchClose(Machine.rightInlane));
        Events.listen(e => this.lowerRampLit = !this.lowerRampLit, onSwitchClose(Machine.shooterLane2));
        Events.listen(e => this.rampUp = true, onSwitchClose(Machine.popBumper));
        Events.listen(e => Machine.ramp.set(e.value), onChange(this, 'rampUp'));
    }

    onSwitch(e: SwitchEvent) {
        console.log('sw event ', e);
    }
}

export class LockLit extends Mode {
    rampUp = false;
}