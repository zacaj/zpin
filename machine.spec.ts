import { Solenoid16 } from './boards';
import { IncreaseSolenoid, MomentarySolenoid } from './machine';
import { passTime, setTime } from './timer';

describe('machine', () => {
    describe('momentary solenoid', () => {
        test('keeps firing', async () => {
            const s = new MomentarySolenoid('rampUp', 1, new Solenoid16(0), 1, 5);
            const fire = jest.spyOn(s.board, 'fireSolenoid').mockResolvedValue('');

            await s.trySet(true);
            expect(fire).toBeCalledTimes(1);

            await passTime(9);
            expect(fire).toBeCalledTimes(2);
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
});