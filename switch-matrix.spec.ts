import { Switch } from './switch-matrix';
import { Mode } from './mode';
import { State } from './state';
import { Outputs } from './outputs';

describe('switch-matrix', () => {
    test('switch triggers output change', () => {
        const sw = new Switch(0, 0);
        const obj = new class extends Mode<{rampUp: boolean}> {
            constructor() {
                super();

                this.out = new Outputs(this, {
                    rampUp: () => sw.state,
                });
            }
        };
        expect(obj.out!.treeValues.rampUp).toBe(false);
        sw.changeState(true);
        expect(obj.out!.treeValues.rampUp).toBe(true);
    });
});