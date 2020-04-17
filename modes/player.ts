import { MachineOutputs, machine } from "../machine";
import { Mode } from "../mode";
import { Poker } from "./poker";
import { State } from "../state";
import { Game } from "../game";
import { Outputs } from "../outputs";
import { Color } from "../light";
import { onSwitchClose, onAnySwitchClose } from "../switch-matrix";
import { DropBankCompleteEvent } from "../drop-bank";
import { Ball } from "./ball";

export class Player extends Mode<MachineOutputs> {
    chips = 1;
    score = 0;
    
    poker!: Poker;

    lowerRampLit = false;
    miniReady = false;
    rampUp = true;

    constructor(
        public game: Game,
    ) {
        super();
        State.declare<Player>(this, ['rampUp', 'miniReady', 'score', 'chips', 'lowerRampLit']);
        this.out = new Outputs(this, {
            rampUp: () => this.rampUp,
            lMiniReady: () => this.miniReady? [Color.Green] : undefined,
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
        
        this.listen(e => e instanceof DropBankCompleteEvent, () => this.miniReady = true);
        this.listen(onAnySwitchClose(machine.sMiniEntry), () => this.miniReady = false);
        
        this.poker = new Poker(this);
        this.addChild(this.poker);
    }
    
    startBall() {
        this.addChild(new Ball(this));
    }
}