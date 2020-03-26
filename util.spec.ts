import { Utils, time, wait } from './util'
import { Tree } from './state';
import { Outputs } from './outputs';

describe('utils', () => {
    test('time should trigger outputs', async () => {
        const obj = new class extends Tree<{time: number}> {

            constructor() {
                super();

                this.out = new Outputs(this, {
                    time: () => time(),
                });
            }
        };

        const a = obj.out!.treeValues.time;
        await wait(10);
        expect(obj.out!.treeValues.time).toBeGreaterThan(a);
    });
});