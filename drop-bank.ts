import { MachineOutputs, MomentarySolenoid } from './machine';
import { Mode } from './mode';
import { Switch, SwitchEvent, onSwitchClose } from './switch-matrix';
import { Outputs, toggle } from './outputs';
import { Event, Events, EventListener, EventTypePredicate } from './events';
import { getTypeIn } from './util';

export class DropBank {
    constructor(
        public coil: MomentarySolenoid,
        public switches: Switch[],
    ) {
    }

    allAreUp(): boolean {
        return this.switches.every(sw => sw.offFor(250));
    }

    allAreDown(): boolean {
        return this.switches.every(sw => sw.onFor(250));
    }

    onTargetDown(): EventTypePredicate<SwitchEvent>[] {
        return this.switches.flatMap(sw => onSwitchClose(sw));
    }

    onAllDown(): EventTypePredicate<DropBankCompleteEvent> {
        return e => e instanceof DropBankCompleteEvent && e.bank === this;
    }
}

export class DropBankResetter extends Mode {
    constructor(
        public bank: DropBank,
    ) {
        super();

        this.out = new Outputs(this, {
            [bank.coil.name]: toggle({
                on: () => bank.allAreDown(),
                off: () => bank.allAreUp(),
                onOn: () => Events.fire(new DropBankCompleteEvent(bank)),
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