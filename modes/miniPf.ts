import { MachineOutputs, machine } from '../machine';
import { Mode, Modes } from '../mode';
import { Ball } from './ball';
import { State } from '../state';
import { Outputs } from '../outputs';
import { onSwitchClose, onAnyPfSwitchExcept } from '../switch-matrix';
import { DropBankCompleteEvent } from '../drop-bank';
import { alert, notify } from '../gfx';
import { round, score } from '../util';
import { time } from '../timer';
import { Color } from '../light';
import { Difficulty } from './player';
import { playVoice } from '../sound';
import { ShimmerLights } from '../util-modes';
import { fork } from '../promises';

export class MiniPf extends Mode {
    waitingForSwitch = true;
    constructor(
        public ball: Ball,
    ) {
        super(Modes.MiniPf);
        const startTime = time();
        State.declare<MiniPf>(this, ['waitingForSwitch']);
        this.out = new Outputs(this, {
            miniDiverter: () => this.waitingForSwitch || time()-startTime<1500,
            lMiniBank: [[Color.White, 'fl']],
        });

        if (machine.lMiniReady.is(Color.Green))
            if (ball.player.difficulty >= Difficulty.Normal)
                ball.player.miniReady = false;

        this.listen(onAnyPfSwitchExcept(...machine.miniBank.switches), 'end');

        this.listen(onAnyPfSwitchExcept(machine.sLeftOutlane), () => this.waitingForSwitch = false);
        this.listen(e => e instanceof DropBankCompleteEvent && e.bank===machine.miniBank, () => {
            if (machine.ballsInPlay<=1)
                ball.shootAgain = true;
            const amount = round(ball.player.score*.2, 10);
            ball.player.addScore(amount, 'bonus jackpot');
            if (amount > ball.player.top20)
                ball.player.top20 = amount;
            notify(score(amount), 8000);
            void playVoice('jackpot excited echo');
            fork(ShimmerLights(this, 2000));
        });

        // todo voice ball saved, jackpot?, 3 2 1
    }

    override end() {
        this.ball.miniPf = undefined;
        return super.end();
    }
}