import { Mode } from './mode';
import { MachineOutputs, machine } from './machine';
import { Outputs } from './outputs';
import { initMachine } from './init';
import { ClearHoles } from './util-modes';

export class AttractMode extends Mode<Pick<MachineOutputs, 'upperEject'|'outhole'|'miniEject'|'shooterDiverter'>> {

    constructor() {
        super();

        this.addChild(new ClearHoles());
    }
}

if (require.main === module) {
// eslint-disable-next-line @typescript-eslint/no-floating-promises
initMachine().then(() => {
    console.info('starting attract mode...');
    machine.addChild(new AttractMode());
});
}