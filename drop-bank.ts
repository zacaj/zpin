import { MachineOutputs, MomentarySolenoid, SolenoidFireEvent, Machine } from './machine';
import { Mode } from './mode';
import { Switch, SwitchEvent, onSwitchClose, onAnySwitchClose } from './switch-matrix';
import { Outputs, toggle } from './outputs';
import { Event, Events, EventCallback, EventTypePredicate } from './events';
import { getTypeIn } from './util';
import { time } from './timer';
import { KnockTarget } from './util-modes';
import { Tree, State } from './state';

export class DropBank extends Tree<MachineOutputs> {
    state: boolean[] = [];

    constructor(
        machine: Machine,
        public coil: MomentarySolenoid,
        public switches: Switch[],
    ) {
        super(machine);
        State.declare<DropBank>(this, ['state']);
        let i=0;
        for (const sw of switches) {
            this.state[i++] = sw.state;
        }

        this.listen([onAnySwitchClose(...switches), () => !coil.lastFired || time() - coil.lastFired > coil.ms],
            e => {
                const i = switches.indexOf(e.sw);
                if (this.state[i]) return;

                this.state[i] = true;
                Events.fire(new DropDownEvent(this, i));
                if (this.state.every(s => s))
                    Events.fire(new DropBankCompleteEvent(this));
            });

        this.listen(machine.out!.onOutputChange(coil.name, false, true),
            () => switches.forEach((_, i) => this.state[i] === false));
    }

    allAreUp(): boolean {
        return this.state.every(sw => sw);
    }

    allAreDown(): boolean {
        return this.state.every(sw => sw);
    }

    onTargetDown(num?: number): EventTypePredicate<DropDownEvent> {
        return e => e instanceof DropDownEvent && e.bank === this && (num === undefined || e.num === num);
    }

    onAllDown(): EventTypePredicate<DropBankCompleteEvent> {
        return e => e instanceof DropBankCompleteEvent && e.bank === this;
    }
}

export class DropBankResetter extends Mode<MachineOutputs> {
    constructor(
        public bank: DropBank,
    ) {
        super();

        this.out = new Outputs(this, {
            [bank.coil.name]: toggle({
                on: () => bank.allAreDown(),
                off: () => bank.switches.every(sw => !sw.state),
            }),
        });
    }
}

export class DropBankCompleteEvent extends Event {
    constructor(
        public bank: DropBank,
    ) {
        super();
    }
}
export class DropDownEvent extends Event {
    constructor(
        public bank: DropBank,
        public num: number,
    ) {
        super();
    }
}