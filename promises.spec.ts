import { fork, forks, FakePromise, settleForks } from './promises';

describe('promises', () => {
    test('ends properly', async () => {
        let resolve1: any;
        const promise = new Promise(r => resolve1 = r);
        const wrapped = fork(promise, 'test');
        expect(forks.size).toBe(1);

        let t2 = 0;
        let resolve2: any;
        const w2 = wrapped.then(() => {
            t2 = 1;
            return new Promise(r => resolve2 = r);
        });
        expect(forks.size).toBe(2);

        resolve1();
        await settleForks();
        expect(forks.size).toBe(1);
        expect(wrapped.ended).toBe(true);
        expect(t2).toBe(1);
        expect((w2 as FakePromise).ended).toBe(false);

        resolve2();
        await settleForks();
        expect(forks.size).toBe(0);
        expect((w2 as FakePromise).ended).toBe(true);
    });
});