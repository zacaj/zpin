import { resetMachine } from './machine';
import { resetSwitchMatrix } from './switch-matrix';
import { Events } from './events';
import { MPU } from './mpu';

beforeEach(() => {
    jest.spyOn(MPU, 'sendCommandCode').mockImplementation(async () => {
        debugger;
        
        expect('command').toBe('mocked');

        return {
            code: 200,
            resp: 'mocked',
        };
    });
});

afterEach(() => {
    Events.resetAll();
    resetSwitchMatrix();
    resetMachine();
});