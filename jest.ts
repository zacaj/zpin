import { resetMachine } from './machine';
import { resetSwitchMatrix } from './switch-matrix';
import { Events } from './events';
import { MPU } from './mpu';
import { Timer, setTime } from './timer';

beforeEach(async () => {
    Timer.reset();
    await setTime(1);
    jest.spyOn(MPU, 'sendCommandCode').mockImplementation(async () => {
        debugger;
        
        expect('command').toBe('mocked');

        return {
            code: 200,
            resp: 'mocked',
        };
    });
});

afterEach(async () => {
    Events.resetAll();
    Timer.reset();
    resetSwitchMatrix();
    resetMachine();
    await setTime();
});