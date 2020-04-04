import { SwitchEvent, onSwitchClose, onAnySwitchClose } from './switch-matrix';
import { Events, onType, Event } from './events';
import { State, StateEvent, onChange, Tree } from './state';
import { machine, MachineOutputs } from './machine';
import { Mode } from './mode';
import { Outputs, toggle } from './outputs';
import { time } from './timer';
import { ClearHoles, ResetAnyDropOnComplete, KnockTarget } from './util-modes';
import { initMachine } from './init';
import { Log } from './log';

// eslint-disable-next-line no-undef
export class Game extends Mode<MachineOutputs> {

    chips = 1;
    rampUp = true;
    
    private constructor() {
        super();
        State.declare<Game>(this, ['rampUp']);

        this.out = new Outputs(this, {
            rampUp: () => this.rampUp,
            troughRelease: () => machine.sTroughFull.onFor(400),
            shooterDiverter: () => machine.sShooterLower.wasClosedWithin(1000) && machine.sShooterMagnet.openForAtLeast(1500),
        });

        this.listen(
            [...onSwitchClose(machine.sRightInlane), () => machine.sShooterLower.wasClosedWithin(2000) || machine.sShooterMagnet.wasClosedWithin(2000)],
            e => {
                this.rampUp = false;
            });
        this.listen(onAnySwitchClose(machine.sPop, machine.sLeftSling, machine.sRightSling),
            e => this.rampUp = true);
        this.listen(onSwitchClose(machine.sLeftInlane),
            () => this.addChild(new KnockTarget()));

        this.listen(
            onAnySwitchClose(machine.sRampMini, machine.sRampMiniOuter, machine.sSpinnerMini, machine.sSidePopMini, machine.sUpperPopMini),
            () => this.chips++);
        this.listen(onSwitchClose(machine.sPopperButton), async () => {
            if (this.chips === 0) return;
            const fired = await machine.cPopper.fire();
            if (fired === true) {
                this.chips--;
            }
        });

        this.addChild(new ClearHoles());
        this.addChild(new ResetAnyDropOnComplete());
    }

    static start(): Game {
        const game = new Game();
        machine.addChild(game);
        return game;
    }
}

export class LockLit extends Mode<Pick<MachineOutputs, 'rampUp'>> {
    rampUp = false;

    constructor() {
        super();

        this.out = new Outputs(this, {
            rampUp: () => this.rampUp,
        });
    }
}

if (require.main === module) {
// eslint-disable-next-line @typescript-eslint/no-floating-promises
initMachine().then(() => {
    Log.log(['console'], 'starting game...');
    const game = Game.start();
});
}