import { MachineOutputs, machine } from '../machine';
import { Mode, Modes } from '../mode';
import { Ball } from './ball';
import { State } from '../state';
import { Outputs } from '../outputs';
import { onSwitchClose, onAnyPfSwitchExcept } from '../switch-matrix';

export class MiniPf extends Mode<MachineOutputs> {
    waitingForSwitch = true;
    constructor(
        public ball: Ball,
    ) {
        super(Modes.MiniPf);
        State.declare<MiniPf>(this, ['waitingForSwitch']);
        this.out = new Outputs(this, {
            miniDiverter: () => this.waitingForSwitch,
            miniFlipperEnable: true,
        });
        ball.miniReady = false;

        this.listen(onAnyPfSwitchExcept(...machine.miniBank.switches), 'end');

        this.listen(onAnyPfSwitchExcept(machine.sLeftOutlane), () => this.waitingForSwitch = false);
    }
}