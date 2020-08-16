import { Mode } from './mode';
import { MachineOutputs, machine } from './machine';
import { Outputs, toggle } from './outputs';
import { getTypeIn, assert } from './util';
import { DropBank, DropBankResetter, DropBankCompleteEvent, DropBankResetEvent } from './drop-bank';
import { Log } from './log';
import { Events, onType } from './events';
import { Tree } from './tree';
import { onSwitchClose } from './switch-matrix';
import { MPU } from './mpu';
import { wait } from './timer';
import { fork } from './promises';

export class ClearHoles extends Tree<MachineOutputs> {

    constructor() {
        super();

        this.out = new Outputs(this, {
            // shooterDiverter: false,
            outhole: () => machine.sOuthole.onFor(500),
            upperEject: () => machine.sUpperEject.onFor(500),
            miniEject: () => machine.sMiniOut.onFor(500),
        });
    }
}

export class ResetAnyDropOnComplete extends Tree<MachineOutputs> {
    constructor() {
        super();
        for (const bank of getTypeIn<DropBank>(machine, DropBank)) {
            this.addChild(new DropBankResetter(bank));
        }
    }
}

export class ResetMechs extends Tree<MachineOutputs> {
    constructor() {
        super();

        const outs: any  = {};
        for (const bank of machine.dropBanks) {
            if (!bank.targets.some(t => t.switch.state)) continue;
            outs[bank.coil.name] = () => bank.targets.some(t => t.switch.state);
        }
        if (Object.keys(outs).length === 0) {
            fork(wait(1).then(() => this.end()));
            return;
        }
        this.out = new Outputs(this, outs);

        this.listen([onType(DropBankResetEvent), () => machine.dropTargets.every(t => !t.switch.state)], 'end');
        fork(wait(1000).then(() => this.end()));
    }
}

export class KnockTarget extends Tree<MachineOutputs> {
    constructor(i?: number) {
        super();
        if (i === undefined)
            i = machine.rightBank.targets.map((t, i) => !t.state? i:undefined).slice().find(i => i !== undefined);
        else
            assert(!machine.rightBank.targets[i].state);
        if (i === undefined) {
            Log.info('game', 'no target to knock down');
            this.end();
            return;
        }

        const coil = machine.cRightDown[i];
        Log.info('game', 'knock down target %i', i);
        machine.rightBank.targets[i].state = true;
        this.out = new Outputs(this, {
            [coil.name]: !machine.rightBank.targets[i].switch.state,
        });
        this.listen(onSwitchClose(machine.rightBank.targets[i].switch), 'end');
    }
}

export class ReleaseBall extends Tree<MachineOutputs> {
    constructor() {
        super();
        assert(!machine.sShooterLane.state);
        this.out = new Outputs(this, {
            troughRelease: true,
        });
        this.listen(onSwitchClose(machine.sShooterLane), 'end');
    }
}