import { Switch } from './switch-matrix';
import { Mode } from './mode';
import { State } from './state';
import { Outputs } from './outputs';
import { Tree } from './tree';

describe('switch-matrix', () => {
    test('switch triggers output change', () => {
        const sw = new Switch(0, 15);
        const obj = new class extends Tree<{rampUp: boolean}> {
            constructor() {
                super();
                this.makeRoot();

                this.out = new Outputs(this, {
                    rampUp: () => sw.state,
                });
            }
        };
        expect(obj.out!.treeValues.rampUp).toBe(false);
        sw.state = true;
        expect(obj.out!.treeValues.rampUp).toBe(true);
    });
});