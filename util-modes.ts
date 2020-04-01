import { Mode } from './mode';
import { MachineOutputs, machine } from './machine';
import { Outputs } from './outputs';
import { getTypeIn } from './util';
import { DropBank, DropBankResetter } from './drop-bank';

export class ClearHoles extends Mode<MachineOutputs> {

    constructor() {
        super();

        this.out = new Outputs(this, {
            shooterDiverter: false,
            outhole: () => machine.sOuthole.onFor(500),
            upperEject: () => machine.sUpperEject.onFor(500),
            miniEject: () => machine.sMiniOut.onFor(500),
        });
    }
}

export class ResetAnyDropOnComplete extends Mode<MachineOutputs> {
    constructor() {
        super();
        for (const bank of getTypeIn<DropBank>(machine, DropBank)) {
            this.addChild(new DropBankResetter(bank));
        }
    }
}