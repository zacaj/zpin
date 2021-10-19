import { Mode, Modes } from './mode';
import { MachineOutputs, machine, MomentarySolenoid, SolenoidFireEvent, Light, Solenoid } from './machine';
import { OutputFuncsOrValues, Outputs, toggle } from './outputs';
import { getTypeIn, assert, score, eq } from './util';
import { DropBank, DropBankResetter, DropBankCompleteEvent, DropBankResetEvent, DropDownEvent, DropTarget } from './drop-bank';
import { Log } from './log';
import { Events, onType } from './events';
import { Tree } from './tree';
import { onAnySwitchClose, onSwitchClose, onSwitchOpen, Switch, SwitchEvent } from './switch-matrix';
import { MPU } from './mpu';
import { Time, Timer, TimerQueueEntry, wait } from './timer';
import { fork } from './promises';
import { alert, notify } from './gfx';
import { Color, colorToArrow } from './light';
import { Player } from './modes/player';
import { Rng } from './rand';
import { State } from './state';
import { dImage } from './disp';
import { playVoice } from './sound';



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
    get nodes() {
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

export async function ResetMechs(parent: Tree<MachineOutputs>, ...except: DropBank[]) {
    const outs: any  = {};
    for (const bank of machine.dropBanks) {
        if (!bank.targets.some(t => t.switch.state) || except.includes(bank)) continue;
        outs[bank.coil.name] = () => bank.targets.some(t => t.switch.state);
    }
    if (Object.keys(outs).length === 0) {
        return;
    }
    const node = new class ResetMechs extends Tree<MachineOutputs> {
        constructor() {
            super();

            this.out = new Outputs(this, outs);

            this.listen([onType(DropBankResetEvent), () => machine.dropBanks.filter(b => !except.includes(b)).every(b => b.targets.every(t => !t.switch.state))], 'end');
            // fork(wait(1000).then(() => this.end()));
        }
    };

    parent.addTemp(node);

    await parent.await(node.onEnd());
}

export async function FireCoil(parent: Tree<MachineOutputs>, coil: Solenoid, time?: number, state = true) {
    const outs: any  = {};
    const node = new class extends Tree<MachineOutputs> {
        constructor() {
            super();

            this.out = new Outputs(this, {
                [coil.name]: state,
            });

            this.listen(e => e instanceof SolenoidFireEvent && e.coil === coil, () => this.end());
        }
    };

    parent.addTemp(node);

    if (time) {
        await wait(time);
        node.end();
    }
    else {
        await parent.await(node.onEnd());
    }
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

    fork(wait(1500).then(() => node.end()));

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
            if (!machine.sTroughFull.state)
                this.listen(machine.cTroughRelease.onFire, 'end');
        }
    };

    parent.addTemp(node);

    await parent.await(node.onEnd());
}

export async function Effect(parent: Tree<MachineOutputs>, ms: number, origFuncs: OutputFuncsOrValues<MachineOutputs>) {

    const node = new class extends Tree<MachineOutputs> {
        constructor() {
            super();
            this.out = new Outputs(this, origFuncs);
        }
    };

    parent.addTemp(node);

    return wait(ms, 'effect').then(() => { node.end(); });
}

export async function AddABall(parent: Tree<MachineOutputs>) {

    const node = new class extends Tree<MachineOutputs> {
        isAddABall = true;
        constructor() {
            super();
            this.out = new Outputs(this, {
                upperEject: false,
            });

            this.listen(onAnySwitchClose(machine.sShooterMagnet, machine.sShooterUpper, ...machine.sLanes), 'end');
            this.listen(e => e instanceof DropDownEvent, 'end');
        }
    };

    parent.addTemp(node);
    alert('BALL ADDED');
    void playVoice('ball added', undefined, true);
    await ReleaseBall(parent);

    await parent.await(node.onEnd());
}

export async function Combo(player: Player, sw: Switch, light: Light, amount = 35000, length = 5000) {
    const node = new class extends Tree<MachineOutputs> {
        constructor(
        ) {
            super();
    
            this.out = new Outputs(this, {
                [light.name]: [[Color.Yellow, 'fl']],
            });
    
            this.listen(onSwitchClose(sw), () => {
                player.score += amount;
                notify(score(amount));
                return this.end();
            });
        }
    };

    player.addTemp(node);

    await Promise.race([
        player.await(node.onEnd()),
        wait(length).then(() => node.end()),
    ]);
}

export enum Award {
    AddValue = 'add_cash_value',
    SubtractValue = 'subtract_cash_value',
    SetSpinner = 'spinner_value',
    AddChip = 'add_cheat',
}

export class MiscAwards extends Tree<MachineOutputs> {
    rng!: Rng;
    targets = new Map<DropTarget, Award>();
    spinnerValue?: number;

    constructor(
        public player: Player,
    ) {
        super();
        this.lPriority = -1;
        this.rng = player.rng();
        State.declare<MiscAwards>(this, ['targets', 'spinnerValue']);
        player.storeData<MiscAwards>(this, ['rng']);

        const outs: any = {};
        for (const target of machine.dropTargets) {
            if (!target.image) continue;
            outs[target.image.name] = () => this.targets.has(target)? dImage(this.targets.get(target) as string) : undefined;
        }
        this.out = new Outputs(this, {
            ...outs,
            spinnerValue: () => this.spinnerValue,
        });

        this.listen<DropDownEvent>([DropDownEvent.on(), e => this.targets.has(e.target)], (e) => {
            if (!e.target.image) return;
            if (!eq(machine.out!.treeValues[e.target.image.name], this.out?.treeValues[e.target.image.name]))
                return;
            this.spinnerValue = undefined;
            switch (this.targets.get(e.target)) {
                case Award.AddChip:
                    player.addChip();
                    break;
                case Award.AddValue:
                    player.changeValue(10);
                    break;
                case Award.SubtractValue:
                    player.changeValue(-10);
                    break;
                case Award.SetSpinner:
                    this.spinnerValue = 4000;
                    break;
            }
            this.targets.delete(e.target);
            if (this.targets.size === 0)
                this.randomizeTargets();
        });
    }

    setTarget(award?: Award, target?: DropTarget) {
        if (!award)
            award = this.rng.weightedSelect(
                [(3-this.player.chips)*.35, Award.AddChip],
                [1, Award.SetSpinner],
                [this.player.store.Poker!.cashValue<250? 0.6 : 1.3, Award.SubtractValue],
                [this.player.store.Poker!.cashValue<250? 1.3 : 0.4, Award.AddValue],
                [1, undefined],
            );
        if (!target)
            target = this.rng.randSelect(...machine.dropTargets);
        if (!award) return;
        
        this.targets.set(target, award);
    }

    addTargets(count: number) {
        for (let i=0; i<count; i++)
            this.setTarget();
    }

    randomizeTargets() {
        this.targets.clear();
        // for (const target of this.rng.randSelectRange(2, 4-this.player.chips+1, ...machine.dropTargets))
        //     this.targets.set(target, Award.AddChip);
        // for (const target of this.rng.randSelectMany(this.rng.weightedSelect([8, 1], [1, 2], [1, 0]), ...machine.dropTargets))
        //     this.targets.set(target, Award.SetSpinner);
        // for (const target of this.rng.randSelectMany(this.rng.weightedSelect([8, 1], [3, 2], [3, 0]), ...machine.dropTargets))
        //     this.targets.set(target, Award.SubtractValue);
        // for (const target of this.rng.randSelectMany(this.rng.weightedSelect([5, 1], [8, 2], [3, 0]), ...machine.dropTargets))
        //     this.targets.set(target, Award.AddValue);
        this.addTargets(this.rng.weightedSelect([50, 5], [20, 3], [20, 7], [7, 10]));
    }

    end() {
        return super.end();
    }
}