import { Mode } from "../mode";
import { MachineOutputs, machine } from "../machine";
import { SkillShotGfx } from "../gfx/skillshot";
import { State } from "../state";
import { Outputs } from "../outputs";
import { screen } from "../gfx";
import { onAnyPfSwitchExcept, onSwitchClose } from "../switch-matrix";


export class Skillshot extends Mode<MachineOutputs> {
    shooterOpen = true;
    constructor() {
        super(700);

        State.declare<Skillshot>(this, ['shooterOpen']);

        this.out = new Outputs(this, {
            shooterDiverter: () => this.shooterOpen,
        });

        this.listen([...onAnyPfSwitchExcept(machine.sShooterLane), () => !machine.sShooterLane.state], () => this.shooterOpen = false);
        this.listen(onSwitchClose(machine.sShooterLane), () => this.shooterOpen = true);

        this.listen(onAnyPfSwitchExcept(machine.sShooterLane, machine.sShooterLower, machine.sShooterUpper, machine.sShooterMagnet), 'end');

        this.gfx?.add(new SkillShotGfx(this));
    }
}