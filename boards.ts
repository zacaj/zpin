import { MPU } from './mpu';
import { Log } from './log';

export class Solenoid16 {
    
    constructor(
        public board: number,
    ) {
        
    }

    init() {
        Log.info(['mpu', 'solenoid'], 'init board %i as s16', this.board);
        return MPU.sendCommand(`i ${this.board} s16`);
    }

    send(cmd: string) {
        return MPU.sendCommand(`${this.board}: ${cmd}`);
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

    initOnOff(num: number, maxOnTime = 0, pulseOffTime = 0) {
        Log.info(['mpu', 'solenoid'], 'init on-off %i on board %i', num, this.board);
        return this.send(`is oo ${num} ${maxOnTime.toFixed()} ${pulseOffTime.toFixed()}`);
    }

    initInput(num: number, settleTime = 3) {
        return this.send(`is i ${num} ${settleTime}`);
    }

    initTriggered(num: number, triggeredBy: number, minOnTime = 0, maxOnTime = 50) {
        return this.send(`is t ${num} ${triggeredBy} ${minOnTime} ${maxOnTime}`);
    }
}
