import { resetMachine, MachineOutputs, machine, Solenoid } from './machine';
import { resetSwitchMatrix } from './switch-matrix';
import { Events } from './events';
import { MPU } from './mpu';
import { Timer, setTime, wait } from './timer';
import { Log } from './log';

beforeEach(async () => {
    jest.spyOn(Timer, 'schedule').mockRestore();
    jest.spyOn(Events, 'listen').mockRestore();
    jest.spyOn(Events, 'fire').mockRestore();
    jest.spyOn(Timer, 'callIn').mockRestore();
    jest.spyOn(Log, 'init').mockImplementation(() => { throw 'unexpected' });
    jest.spyOn(Log, 'write').mockReturnValue();
    jest.spyOn(Log, 'logMessage').mockReturnValue();
    jest.spyOn(Log, 'trace').mockReturnValue();
    Timer.reset();
    Events.resetAll();
    resetSwitchMatrix();
    resetMachine();
    await setTime(1);
    jest.spyOn(MPU, 'sendCommandCode').mockImplementation(async (cmd) => {
        debugger;
        
        expect(cmd).toBe('mocked');

        return {
            code: 200,
            resp: 'mocked',
        };
    });
});

afterEach(async () => {
    Events.resetAll();
    Timer.reset();
    await setTime();
    jest.spyOn(Timer, 'callIn').mockReturnValue({} as any);
    jest.spyOn(Timer, 'schedule').mockReturnValue({} as any);
    jest.spyOn(Events, 'listen').mockReturnValue({} as any);
    jest.spyOn(Events, 'fire').mockReturnValue({} as any);
    await new Promise(r => setTimeout(r, 50));
});