import { Mode } from './mode';
import { MachineOutputs, machine } from './machine';
import { Outputs } from './outputs';
import { initMachine } from './init';
import { ClearHoles, ResetAnyDropOnComplete } from './util-modes';
import { Log } from './log';

export class AttractMode extends Mode<MachineOutputs> {

    constructor() {
        super();

        this.addChild(new ClearHoles());
        this.addChild(new ResetAnyDropOnComplete());
    }
}

if (require.main === module) {
// eslint-disable-next-line @typescript-eslint/no-floating-promises
initMachine().then(() => {
    Log.log(['console'], 'starting attract mode...');
    machine.addChild(new AttractMode());
});
}