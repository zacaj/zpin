import { MachineOutputs, MomentarySolenoid, SolenoidFireEvent, Machine, ImageOutputs, Image } from './machine';
import { Mode } from './mode';
import { Switch, SwitchEvent, onSwitchClose, onAnySwitchClose } from './switch-matrix';
import { Outputs, toggle } from './outputs';
import { Event, Events, EventCallback, EventTypePredicate } from './events';
import { getTypeIn } from './util';
import { time } from './timer';
import { KnockTarget } from './util-modes';
import { Tree, State } from './state';

export interface DropTarget {
    state: boolean;
    bank: DropBank;
    num: number;
    switch: Switch;
    image: Image;
}

export class DropBank extends Tree<MachineOutputs> {
    targets: DropTarget[] = [];

    constructor(
        machine: Machine,
        public coil: MomentarySolenoid,
        switches: Switch[],
        nums: number[],
        images: (keyof ImageOutputs)[],
    ) {
        super(machine);
        let i=0;
        for (const sw of switches) {
            const target: DropTarget = {
                state: sw.state,
                bank: this,
                num: nums[i],
                image: new Image(images[i]),
                switch: sw,
            };
            State.declare<DropTarget>(target, ['state']);
            i++;
            this.targets.push(target);
            machine.dropTargets.push(target);
        }

        this.listen([onAnySwitchClose(...switches), () => !coil.lastFired || time() - coil.lastFired > coil.ms],
            e => {
                const i = switches.indexOf(e.sw);
                if (this.targets[i].state) return;

                this.targets[i].state = true;
                Events.fire(new DropDownEvent(this.targets[i]));
                if (this.targets.every(t => t.state))
                    Events.fire(new DropBankCompleteEvent(this));
            });

        this.listen(machine.out!.onOutputChange(coil.name, false, true),
            () => switches.forEach((_, i) => this.targets[i].state === false));
    }

    allAreUp(): boolean {
        return this.targets.every(t => t.state);
    }

    allAreDown(): boolean {
        return this.targets.every(t => t.state);
    }

    onTargetDown(num?: number): EventTypePredicate<DropDownEvent> {
        return e => e instanceof DropDownEvent && e.target.bank === this && (num === undefined || this.targets.indexOf(e.target) === num);
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
                off: () => bank.targets.every(t => !t.switch.state),
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
        public target: DropTarget,
    ) {
        super();
    }
}