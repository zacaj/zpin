import { MPU } from './mpu';
import { Log } from './log';
import { machine } from './machine';
import { Timer, TimerQueueEntry } from './timer';

export class Solenoid16 {
    hbId?: string;
    heartbeatTimer?: TimerQueueEntry;
    
    constructor(
        public board: number,
    ) {
        
    }

    init() {
        if (!machine.sDetect3.state) {
            Log.log(['mpu', 'solenoid'], 'skip initializing board %i, no power', this.board);
            return;
        }
        Log.info(['mpu', 'solenoid'], 'init board %i as s16', this.board);
        if (!MPU.isLive) return;
        return MPU.sendCommand(`i ${this.board} s16`)
        .then(() => {
            Timer.cancel(this.heartbeatTimer);
            this.heartbeatTimer = Timer.setInterval(() => this.heartbeat(), 1000, `board ${this.board} heartbeat`, Math.random()*1000 );
        }).catch(e => {
            Log.error('console', 'error initializing boards', e);
            process.exit(1);
        });
    }

    send(cmd: string, force = false) {
        if (!MPU.isLive && !force) return;
        return MPU.sendCommand(`${this.board}: ${cmd}`);
    }

    async heartbeat() {
        if (!machine.sDetect3.state || !MPU.isLive || !machine.game) return;

        const hb = await this.send('hb');
        if (!this.hbId) {
            this.hbId = hb;
            Log.log('mpu', 'got heartbeat %s for board %i', hb, this.board);
        }
        else {
            if (hb !== this.hbId) {
                Log.error(['mpu', 'assert'], 'heartbeat mismatch (%s now %s) for board %i, reinitializing...', this.hbId, hb, this.board);
                this.hbId = hb;
                await this.init();
                
                for (const s of machine.coils.filter(c => c.board === this)) {
                    await s.init();
                    await s.set(s.val);
                }
                Log.log('mpu', 'board %i re-init complete', this.board);
            }
        }
    }

    fireSolenoid(num: number) {
        return this.send(`f ${num}`);
    }

    turnOnSolenoid(num: number) {
        return this.send(`on ${num}`);
    }

    turnOffSolenoid(num: number) {
        return this.send(`off ${num}`);
    }


    toggleSolenoid(num: number) {
        return this.send(`toggle ${num}`);
    }

    fireSolenoidFor(num: number, onTime: number) {
        return this.send(`f ${num} ${onTime.toFixed()}`);
    }

    disableSolenoid(num: number) {
        return this.send(`d ${num}`);
    }

    initMomentary(num: number, onTime = 50) {
        Log.info(['mpu', 'solenoid'], 'init momentary %i on board %i', num, this.board);
        return this.send(`is m ${num} ${onTime.toFixed()}`);
    }

    initOnOff(num: number, maxOnTime = 0, pulseOffTime = 0, pulseOnTime = 1) {
        Log.info(['mpu', 'solenoid'], 'init on-off %i on board %i', num, this.board);
        return this.send(`is oo ${num} ${maxOnTime.toFixed()} ${pulseOffTime.toFixed()} ${pulseOnTime.toFixed()}`);
    }

    initInput(num: number, settleTime = 3) {
        return this.send(`is i ${num} ${settleTime}`);
    }

    initTriggered(num: number, triggeredBy: number, minOnTime = 0, maxOnTime = 50) {
        return this.send(`is t ${num} ${triggeredBy} ${minOnTime} ${maxOnTime}`);
    }
}
