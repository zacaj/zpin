import { Solenoid16 } from './boards';
import { IncreaseSolenoid, MomentarySolenoid, machine, MachineOutputs, expectMachineOutputs } from './machine';
import { passTime, setTime, wait } from './timer';
import { Mode } from './mode';
import { State } from './state';
import { Outputs } from './outputs';

describe('machine', () => {
    describe('momentary solenoid', () => {
        test('keeps firing', async () => {
            const s = new MomentarySolenoid('rampUp', 1, new Solenoid16(0), 1, 5);
            const fire = jest.spyOn(s.board, 'fireSolenoid').mockResolvedValue('');

            s.val = true;
            await s.trySet();
            expect(fire).toBeCalledTimes(1);

            await passTime(9);
            expect(fire).toBeCalledTimes(2);
        });
        test('stops firing', async () => {
            const s = new MomentarySolenoid('rampUp', 1, new Solenoid16(0), 1, 5);
            const fire = jest.spyOn(s.board, 'fireSolenoid').mockResolvedValue('');

            s.val = true;
            await s.trySet();
            expect(fire).toBeCalledTimes(1);

            await passTime(9);
            expect(fire).toBeCalledTimes(2);
            s.val = false;
            await s.trySet();
            await passTime(9);
            expect(fire).toBeCalledTimes(2);
        });
        test('doesnt fire two at once', async () => {
            const a = new MomentarySolenoid('rampUp', 1, new Solenoid16(0), 1, 5);
            const b = new MomentarySolenoid('upper3', 2, new Solenoid16(1), 1, 5);
            const fireA = jest.spyOn(a.board, 'fireSolenoid').mockResolvedValue('');
            const fireB = jest.spyOn(b.board, 'fireSolenoid').mockResolvedValue('');
            a.val = true;
            await a.trySet();
            b.val = true;
            await b.trySet();
            expect(fireA).toHaveBeenCalledTimes(1);
            expect(fireB).toHaveBeenCalledTimes(0);
            await passTime(2);
            expect(fireA).toHaveBeenCalledTimes(1);
            expect(fireB).toHaveBeenCalledTimes(1);
        });
    });
    describe('increase solenoid', () => {
        test('doesnt fire too soon', async () => {
            await setTime(1);
            const s = new IncreaseSolenoid('rampUp', 1, new Solenoid16(0), 10, 20, 2);
            const fire = jest.spyOn(s.board, 'fireSolenoidFor').mockResolvedValue('');

            expect(await s.fire()).toBeGreaterThan(s.wait+s.initial);
            expect(fire).toBeCalledTimes(1);
            expect(s.lastFired).toBe(1);

            await passTime(5);
            expect(await s.fire()).toBeLessThan(s.wait+s.initial);
            expect(fire).toBeCalledTimes(1);
            expect(s.lastFired).toBe(1);

            await passTime(s.resetPeriod*2);
            expect(await s.fire()).toBeGreaterThan(s.wait+s.initial);
            expect(fire).toBeCalledTimes(2);
        });

        test('fires for longer', async () => {
            await setTime(1);
            const s = new IncreaseSolenoid('rampUp', 1, new Solenoid16(0), 10, 20, 2);
            const fire = jest.spyOn(s.board, 'fireSolenoidFor').mockResolvedValue('');

            expect(await s.fire()).toBeGreaterThan(s.wait+s.initial);
            expect(fire).toBeCalledWith(1, s.initial);
            fire.mockClear();

            await passTime(s.wait + 2);
            expect(await s.fire()).toBeGreaterThan(s.wait+s.max);
            expect(fire).toBeCalledWith(1, s.max);
        });
    });

    // test('eos pulse', async () => {
    //     expectMachineOutputs('rampUp');
    //     expect(machine.cRamp.actual).toBe(false);
    //     await passTime(100);
    //     const child = new class extends Mode<MachineOutputs> {
    //         rampUp = true;
    //         constructor() {
    //             super();
    //             State.declare<any>(this, ['rampUp']);

    //             this.out = new Outputs(this, {
    //                 rampUp: () => this.rampUp,
    //             });
    //         }
    //     };
    //     machine.addChild(child);
    //     machine.sRampDown.state = false;
    //     await passTime(5);
    //     expect(machine.cRamp.actual).toBe(true);
    //     const set = jest.spyOn(machine.cRamp, 'set').mockImplementation(async () => {
    //         await wait(10);
    //         return true;
    //     });
    //     set.mockClear();

    //     machine.sRampDown.state = true;
    //     await passTime(1);
    //     expect(set).toBeCalledWith(false);
    //     expect(machine.cRamp.val).toBe(false);
    //     expect(machine.cRamp.actual).toBe(true);
    //     await passTime(10);
    //     expect(machine.cRamp.actual).toBe(false);
    //     expect(set).toBeCalledTimes(1);
    //     set.mockClear();

    //     await passTime(1);
    //     expect(set).toBeCalledWith(true);
    //     await passTime(10);
    //     expect(machine.cRamp.actual).toBe(true);

    // });
});