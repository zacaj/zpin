import { State } from './state';
import { Solenoid16 } from './boards';
import { matrix } from './switch-matrix';

abstract class Solenoid {
    constructor(
        public num: number,
        public board: Solenoid16,
    ) {
    }
}

class OnOffSolenoid extends Solenoid {
    // constructor(
    //     num: number,
    //     board: Solenoid16,
    // ) {
    //     super(num, board);
    // }
    async set(on: boolean) {
        if (on)
            return this.board.turnOnSolenoid(this.num);
        else
            return this.board.turnOffSolenoid(this.num);
    }
}

export class Machine {
    static solenoidBank1 = new Solenoid16(0);
    static ramp = new OnOffSolenoid(0, Machine.solenoidBank1);

    static rightInlane = matrix[0][0];
    static shooterLane2 = matrix[0][1];
    static popBumper = matrix[0][1];
}