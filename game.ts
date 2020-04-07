import { SwitchEvent, onSwitchClose, onAnySwitchClose, resetSwitchMatrix } from './switch-matrix';
import { Events, onType, Event } from './events';
import { State, StateEvent, onChange, Tree } from './state';
import { machine, MachineOutputs, resetMachine } from './machine';
import { Mode } from './mode';
import { Outputs, toggle } from './outputs';
import { time, safeSetTimeout, Timer } from './timer';
import { ClearHoles, ResetAnyDropOnComplete, KnockTarget } from './util-modes';
import { initMachine } from './init';
import { Log } from './log';
import { Poker } from './poker';
import { Color } from './light';

// eslint-disable-next-line no-undef
export class Game extends Mode<MachineOutputs> {

    chips = 1;

    rampUp = true;
    lowerRampLit = false;

    poker!: Poker;
    
    private constructor() {
        super();
        State.declare<Game>(this, ['rampUp']);

        this.out = new Outputs(this, {
            rampUp: () => this.rampUp,
            troughRelease: () => machine.sTroughFull.onFor(400),
            shooterDiverter: toggle({
                on: () => machine.sShooterLower.wasClosedWithin(1000) && machine.sShooterMagnet.openForAtLeast(1500) && machine.sShooterLane.openForAtLeast(5000)
                    || machine.sShooterLane.state,
                off: () => machine.sShooterLower.state,
            }),
            lLowerRamp: () => this.lowerRampLit? [Color.White] : [],
        });

        this.listen(
            [...onSwitchClose(machine.sRightInlane), () => machine.sShooterLower.wasClosedWithin(2000) || machine.sShooterMagnet.wasClosedWithin(2000)],
            e => {
                this.rampUp = false;
            });
        this.listen(
            [...onSwitchClose(machine.sRightInlane), () => this.lowerRampLit],
            e => {
                this.rampUp = false;
            });
        this.listen(onAnySwitchClose(machine.sPop, machine.sLeftSling, machine.sRightSling),
            e => {
                this.rampUp = true;
                this.lowerRampLit = !this.lowerRampLit;
            });
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

        this.addChild(new ClearHoles(), -1);
        this.addChild(new ResetAnyDropOnComplete(), -1);
        this.poker = new Poker();
        this.addChild(this.poker);
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
initMachine(true, false, false).then(() => {
    Log.log(['console'], 'starting game...');
    const game = Game.start();

    // safeSetTimeout(() => {
    //     for (let i=0; i<100; i++) {
    //     Log.log('console', 'start');
    //     console.time('start');
    //     machine.sCenterCenter.state = !machine.sCenterCenter.state;
    //     console.timeEnd('start');
    //     Log.log('console', 'end');
    //     Events.resetAll();
    //     Timer.reset();
    //     resetSwitchMatrix();
    //     resetMachine();
    //     }
    //     setTimeout(() => process.exit(0), 500);
    // }, 200, '');
});
}