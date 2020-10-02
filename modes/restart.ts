import { Group, Text } from 'aminogfx-gl';
import { gfx, screen, textBox } from '../gfx';
import { Color, flash } from '../light';
import { machine, MachineOutputs } from '../machine';
import { Mode, Modes } from '../mode';
import { Outputs } from '../outputs';
import { fork } from '../promises';
import { State } from '../state';
import { onAnySwitchClose, onSwitchClose } from '../switch-matrix';

export class Restart extends Mode {
    text!: Group;

    constructor(
        public flips: number,
        public action: (restart: Restart) => any,
        public failed: (restart: Restart) => any = () => {},
    ) {
        super(Modes.Restart);
        State.declare<Restart>(this, ['flips']);

        this.out = new Outputs(this, {
            lRampArrow: flash(true, Color.Yellow, 5),
            rampUp: false,
        });

        this.listen(onAnySwitchClose(machine.sLeftFlipper, machine.sRightFlipper), () => {
            if (this.flips > 0) {
                this.flips--;
                return undefined;
            } else {
                return this.end();
            }
        });

        this.listen(onSwitchClose(machine.sRampMade), () => {
            fork(action(this));
            return this.end();
        });

        this.text = textBox({maxWidth: 0.8}, 
            ['MULTIBALL RESTART', 80, 70],
            ['SHOOT RAMP', 70, 80],
            ['', 45],
        );
        if (screen) {
            screen.add(this.text);
            this.text.z(100);
            this.watch(() => (this.text.children[3] as Text).text(`${this.flips} flip${this.flips>1?'s':''} left`));
        }
    }

    end() {
        screen?.remove(this.text);
        return super.end();
    }
}