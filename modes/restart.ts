import { Group, Text } from 'aminogfx-gl';
import { dImage } from '../disp';
import { gfx, screen, textBox } from '../gfx';
import { Color, flash } from '../light';
import { machine, MachineOutputs } from '../machine';
import { Mode, Modes } from '../mode';
import { Outputs } from '../outputs';
import { fork } from '../promises';
import { playVoice } from '../sound';
import { State } from '../state';
import { onAnySwitchClose, onSwitchClose } from '../switch-matrix';
import { Ball, BallEnding } from './ball';
import { Difficulty } from './player';

export class Restart extends Mode {
    text!: Group;

    constructor(
        public ball: Ball,
        public flips: number,
        public action: (restart: Restart) => any,
        public failed: (restart: Restart) => any = () => {},
    ) {
        super(Modes.Restart);
        State.declare<Restart>(this, ['flips']);

        if (ball.player.difficulty >= Difficulty.Expert)
            flips = Math.min(flips, 12);
        if (ball.player.difficulty >= Difficulty.Zac)
            flips = Math.min(flips, 6);

        this.out = new Outputs(this, {
            lRampArrow: flash(true, Color.Yellow, 5),
            iRamp: dImage('restart_mb'),
            rampUp: false,
        });

        void playVoice('shoot the ramp');

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

        let misses = 2;
        this.listen(onAnySwitchClose(machine.sRampMini, machine.sSingleStandup), () => {
            if (--misses === 0) {
                void playVoice('no the ramp');
                misses = 3;
            }
        });

        this.text = textBox({maxWidth: 0.8}, 
            ['MULTIBALL RESTART', 80, 70],
            ['SHOOT RAMP', 70, 80],
            ['', 45],
        );
        if (screen) {
            ball.gfx?.add(this.text);
            this.text.z(100);
            this.watch(() => (this.text.children[3] as Text).text(`${this.flips} flip${this.flips>1?'s':''} left`));
        }

        this.listen(e => e instanceof BallEnding, 'end');
    }

    end() {
        this.ball.gfx?.remove(this.text);
        return super.end();
    }
}
