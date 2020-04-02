import { Mode } from './mode';
import { MachineOutputs, machine } from './machine';
import { Outputs, toggle } from './outputs';
import { getTypeIn } from './util';
import { DropBank, DropBankResetter } from './drop-bank';
import { Log } from './log';
import { Events } from './events';

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

export class KnockTarget extends Mode<MachineOutputs> {
    constructor() {
        super();
        const i = machine.rightBank.state.indexOf(false);
        if (i === -1) {
            Log.info('game', 'no target to knock down');
            this.end();
            return;
        }

        const coil = machine.cRightDown[i];
        this.out = new Outputs(this, {
            [coil.name]: !machine.rightBank.state[i],
        });
        Events.listen(() => this.end(), machine.rightBank.onTargetDown(i));
    }
}