import { MachineOutputs, machine } from '../machine';
import { Mode, Modes } from '../mode';
import { Ball } from './ball';
import { State } from '../state';
import { Outputs } from '../outputs';
import { onSwitchClose, onAnyPfSwitchExcept } from '../switch-matrix';
import { DropBankCompleteEvent } from '../drop-bank';
import { alert, notify } from '../gfx';
import { score } from '../util';

export class MiniPf extends Mode {
    waitingForSwitch = true;
    constructor(
        public ball: Ball,
    ) {
        super(Modes.MiniPf);
        State.declare<MiniPf>(this, ['waitingForSwitch']);
        this.out = new Outputs(this, {
            miniDiverter: () => this.waitingForSwitch,
        });
        ball.player.miniReady = false;

        this.listen(onAnyPfSwitchExcept(...machine.miniBank.switches), 'end');

        this.listen(onAnyPfSwitchExcept(machine.sLeftOutlane), () => this.waitingForSwitch = false);
        this.listen(e => e instanceof DropBankCompleteEvent && e.bank===machine.miniBank, () => {
            ball.shootAgain = true;
            ball.player.score += 500000;
            notify(score(500000), 5000);
        });
    }

    end() {
        this.ball.miniPf = undefined;
        return super.end();
    }
}