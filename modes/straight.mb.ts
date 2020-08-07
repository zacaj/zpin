import { Multiball } from './multiball';
import { queueDisplay, alert } from '../gfx';

export class StraightMb extends Multiball {
    constructor() {
        super();
    }

    async start() {
        const finish = await queueDisplay(this.gfx!, 'straight mb start');
        await alert('Straight Multiball!', 3000)[1];
        await super.start();
        await this.releaseBallFromTrough();
        finish();
    }

    firstSwitchHit() {
        this.releaseBallsFromLock();
        return super.firstSwitchHit();
    }
}