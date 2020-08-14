import { Multiball } from './multiball';
import { queueDisplay, alert } from '../gfx';
import { fork } from '../promises';

export class StraightMb extends Multiball {
    constructor() {
        super();
    }

    async start() {
        const finish = await queueDisplay(this.gfx!, 3, 'straight mb start');
        await alert('Straight Multiball!', 3000)[1];
        await super.start();
        await this.releaseBallFromTrough();
        finish();
    }

    firstSwitchHit() {
        fork(this.releaseBallsFromLock());
        return super.firstSwitchHit();
    }
}