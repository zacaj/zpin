import { Mode, Modes } from './mode';
import { MachineOutputs, machine } from './machine';
import { Outputs } from './outputs';
import { initMachine } from './init';
import { ClearHoles, ResetAnyDropOnComplete } from './util-modes';
import { Log } from './log';
import { fork } from './promises';

export class AttractMode extends Mode {

    constructor() {
        super(Modes.AttractMode);

        // this.addTemp(new ClearHoles());
        // this.addTemp(new ResetAnyDropOnComplete());
    }
}

if (require.main === module) {
fork(initMachine()).then(() => {
    Log.log(['console'], 'starting attract mode...');
    // machine.addTemp(new AttractMode());
});
}