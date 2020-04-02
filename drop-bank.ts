import { MachineOutputs, MomentarySolenoid, SolenoidFireEvent, machine } from './machine';
import { Mode } from './mode';
import { Switch, SwitchEvent, onSwitchClose, onAnySwitchClose } from './switch-matrix';
import { Outputs, toggle } from './outputs';
import { Event, Events, EventListener, EventTypePredicate } from './events';
import { getTypeIn } from './util';
import { time } from './timer';
import { KnockTarget } from './util-modes';

export class DropBank {
    state: boolean[] = [];

    constructor(
        public coil: MomentarySolenoid,
        public switches: Switch[],
    ) {
        let i=0;
        for (const sw of switches) {
            this.state[i++] = sw.state;
        }

        Events.listen(e => {
            const i = switches.indexOf(e.sw);
            if (this.state[i]) return;

            this.state[i] = true;
            Events.fire(new DropDownEvent(this, i));
        }, onAnySwitchClose(...switches), e => !coil.lastFired || time() - coil.lastFired > coil.ms);

        Events.listen(() => switches.forEach((_, i) => this.state[i] === false), e => e instanceof SolenoidFireEvent && e.coil === this.coil);
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
export class DropDownEvent extends Event {
    constructor(
        public bank: DropBank,
        public num: number,
    ) {
        super();
    }
}