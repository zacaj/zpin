import { MachineOutputs, machine } from '../machine';
import { Mode, Modes } from '../mode';
import { Ball } from './ball';
import { State } from '../state';
import { Outputs } from '../outputs';
import { onSwitchClose, onAnyPfSwitchExcept } from '../switch-matrix';

export class MiniPf extends Mode {
    waitingForSwitch = true;
    drained = false;
    constructor(
        public ball: Ball,
    ) {
        super(Modes.MiniPf);
        State.declare<MiniPf>(this, ['waitingForSwitch', 'drained']);
        this.out = new Outputs(this, {
            miniDiverter: () => this.waitingForSwitch,
            miniFlipperEnable: () => !this.drained,
            kickerEnable: () => !this.drained,
        });
        ball.player.miniReady = false;

        this.listen(onAnyPfSwitchExcept(...machine.miniBank.switches, machine.sMiniOut), 'end');

        this.listen(onAnyPfSwitchExcept(machine.sLeftOutlane), () => this.waitingForSwitch = false);

        this.listen(onSwitchClose(machine.sMiniOut), () => this.drained = true);
    }

    end() {
        this.ball.miniPf = undefined;
        return super.end();
    }
}