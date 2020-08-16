import { Timer, Time, setTime, time, wait } from './timer';
import { Tree } from './tree';
import { Outputs } from './outputs';

describe('Timer', () => {
    test('time should trigger outputs', async () => {
        await setTime();
        const obj = new class extends Tree<{time: number}> {

            constructor() {
                super();
                this.makeRoot();

                this.out = new Outputs(this, {
                    time: () => time(),
                });
            }
        };
        const a = obj.out!.treeValues.time;
        await wait(10);
        expect(obj.out!.treeValues.time).toBeGreaterThan(a);
    });
    describe('addToQueue', () => {
        beforeEach(() => {
            Timer.queue = [
                { time: 2 },
                { time: 4 },
                { time: 6 },
            ] as any;
        });
        test('1', () => {
            const e = Timer.schedule(() => 0, 1 as Time);
            expect(Timer.queue.indexOf(e)).toBe(0);
        });
        test('2', () => {
            const e = Timer.schedule(() => 0, 2 as Time);
            expect(Timer.queue.indexOf(e)).toBe(0);
        });
        test('3', () => {
            const e = Timer.schedule(() => 0, 3 as Time);
            expect(Timer.queue.indexOf(e)).toBe(1);
        });
        test('4', () => {
            const e = Timer.schedule(() => 0, 4 as Time);
            expect(Timer.queue.indexOf(e)).toBe(1);
        });
        test('7', () => {
            const e = Timer.schedule(() => 0, 7 as Time);
            expect(Timer.queue.indexOf(e)).toBe(3);
        });
    });
});