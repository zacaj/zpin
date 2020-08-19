import { Multiball } from './multiball';
import { alert } from '../gfx';
import { fork } from '../promises';
import { DropBank, DropBankCompleteEvent } from '../drop-bank';
import { Player } from './player';
import { machine } from '../machine';
import { State } from '../state';
import { Outputs } from '../outputs';
import { AnimParams } from 'aminogfx-gl';
import { onSwitchClose } from '../switch-matrix';
import { StraightMbGfx } from '../gfx/straight.mb';
import { light, Color } from '../light';
import { Priorities, Events } from '../events';

export class StraightMb extends Multiball {

    curBank?: DropBank;
    value = 1000000;
    awardingJp = 0;

    protected constructor(
        player: Player,
    ) {
        super(player);
        State.declare<StraightMb>(this, ['curBank', 'value', 'awardingJp']);
        this.selectBank();
        const outs: any  = {};
        for (const target of machine.dropTargets) {
            outs[target.image.name] = () => target.bank === this.curBank? 'redArrow' : undefined;
        }
        this.out = new Outputs(this, {
            ...outs,
            rampUp: () => !!this.curBank && !this.awardingJp,
            lockPost: () => this.lockPost ?? false,
            lRampArrow: () => light(!this.curBank, Color.Red),
        });

        this.listen(onSwitchClose(machine.sRampMade), 'jackpot');

        this.listen<DropBankCompleteEvent>([e => e instanceof DropBankCompleteEvent, e => e.bank === this.curBank], () => this.curBank = undefined);

        this.gfx?.add(new StraightMbGfx(this));
    }

    static async start(player: Player): Promise<StraightMb|false> {
        const finish = await Events.tryPriority(Priorities.StartMb);
        if (!finish) return false;

        if (!player.curMode) {
            player.mbsQualified.delete(StraightMb);
            const mb = new StraightMb(player);
            player.ball.addChild(mb);
            await alert('Straight Multiball!', 3000)[1];
            await mb.start();
            await mb.releaseBallFromTrough();
            finish();
            return mb;
        } else {
            finish();
            return false;
        }
    }

    firstSwitchHit() {
        fork(this.releaseBallsFromLock());
        return super.firstSwitchHit();
    }

    selectBank() {
        const i = this.player.weightedRand(1, 1, 5, 0, 3, 3);
        this.curBank = machine.dropBanks[i];
    }

    async jackpot() {
        if (this.awardingJp)
            fork(this.releaseBallFromLock());
        this.awardingJp++;
        const [group, promise] = alert('JACKPOT!', 5000, `${this.value}`);
        const anim: AnimParams = {
            from: 1,
            to: 2,
            duration: 350,
            loop: 4,
            timeFunc: 'linear',
        };
        group.sx.anim(anim).start();
        group.sy.anim(anim).start();
        await promise;
        this.awardingJp--;
        if (this.awardingJp === 0) {
            fork(this.releaseBallFromLock());
            this.value += 500000;
            this.selectBank();
        }
    }
}