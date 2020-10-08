import { Mode } from './mode';
import { MachineOutputs, machine, MomentarySolenoid, SolenoidFireEvent } from './machine';
import { Outputs, toggle } from './outputs';
import { getTypeIn, assert } from './util';
import { DropBank, DropBankResetter, DropBankCompleteEvent, DropBankResetEvent } from './drop-bank';
import { Log } from './log';
import { Events, onType } from './events';
import { Tree } from './tree';
import { onSwitchClose, onSwitchOpen } from './switch-matrix';
import { MPU } from './mpu';
import { wait } from './timer';
import { fork } from './promises';



export class ClearHoles extends Tree<MachineOutputs> {

    constructor() {
        super();

        this.out = new Outputs(this, {
            // shooterDiverter: false,
            outhole: () => machine.sOuthole.state,
            upperEject: () => machine.sUpperEject.onFor(500),
            miniEject: () => machine.sMiniOut.state,
        });
    }
}

export class ResetAnyDropOnComplete extends Tree<MachineOutputs> {
    get children() {
        return this.resetters;
    }

    resetters: DropBankResetter[] = [];

    constructor() {
        super();
        for (const bank of getTypeIn<DropBank>(machine, DropBank)) {
            this.resetters.push(new DropBankResetter(bank));
        }
    }
}

export async function ResetMechs(parent: Tree<MachineOutputs>) {
    const outs: any  = {};
    for (const bank of machine.dropBanks) {
        if (!bank.targets.some(t => t.switch.state)) continue;
        outs[bank.coil.name] = () => bank.targets.some(t => t.switch.state);
    }
    if (Object.keys(outs).length === 0) {
        return;
    }
    const node = new class ResetMechs extends Tree<MachineOutputs> {
        constructor() {
            super();

            this.out = new Outputs(this, outs);

            this.listen([onType(DropBankResetEvent), () => machine.dropTargets.every(t => !t.switch.state)], 'end');
            // fork(wait(1000).then(() => this.end()));
        }
    };

    parent.addTemp(node);

    await parent.await(node.onEnd());
}

export async function FireCoil(parent: Tree<MachineOutputs>, coil: MomentarySolenoid) {
    const outs: any  = {};
    const node = new class extends Tree<MachineOutputs> {
        constructor() {
            super();

            this.out = new Outputs(this, {
                [coil.name]: true,
            });

            this.listen(e => e instanceof SolenoidFireEvent && e.coil === coil, () => this.end());
        }
    };

    parent.addTemp(node);

    await parent.await(node.onEnd());
}

export async function ResetBank(parent: Tree<MachineOutputs>, bank: DropBank) {
    await FireCoil(parent, bank.coil);
}

export async function KnockTarget(parent: Tree<MachineOutputs>, i?: number) {
    if (i === undefined)
        i = machine.rightBank.targets.map((t, i) => !t.state? i:undefined).slice().find(i => i !== undefined);
    else
        assert(!machine.rightBank.targets[i].state);
    if (i === undefined) {
        Log.info('game', 'no target to knock down');
        return;
    }

    const node = new class extends Tree<MachineOutputs> {
        constructor() {
            super();
            
            const coil = machine.cRightDown[i!];
            Log.info('game', 'knock down target %i', i);
            machine.rightBank.targets[i!].state = true;
            this.out = new Outputs(this, {
                [coil.name]: !machine.rightBank.targets[i!].switch.state,
            });
            this.listen(onSwitchClose(machine.rightBank.targets[i!].switch), 'end');
        }
    };

    parent.addTemp(node);

    await parent.await(node.onEnd());
}

export async function ReleaseBall(parent: Tree<MachineOutputs>) {
    if (machine.sShooterLane.state) {
        return;
    }

    const node = new class extends Tree<MachineOutputs> {
        constructor() {
            super();
            // assert(!machine.sShooterLane.state);
            this.out = new Outputs(this, {
                troughRelease: !machine.sShooterLane.state,
            });
            this.listen(onSwitchClose(machine.sShooterLane), 'end');
            this.listen(onSwitchOpen(machine.sTroughFull), 'end');
            this.listen(machine.cTroughRelease.onFire, 'end');
        }
    };

    parent.addTemp(node);

    await parent.await(node.onEnd());
}