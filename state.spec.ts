import { Events } from './events';
import { State, Tree } from './state';
import { Mode } from './mode';
import { makeOutputs, outputs, Outputs } from './outputs';

describe('state', () => {
    test('fires events', () => {
        const fire = jest.spyOn(Events, 'fire').mockReturnValue();
        const obj = {
            data: 1,
            children: [],
        };
        State.declare(obj, ['data']);
        expect(obj.data).toBe(1);
        obj.data = 2;
        expect(obj.data).toBe(2);
        expect(fire).toBeCalled();
    });
    /*test('inherits state', () => {
        const parent = new class extends Mode {
            data = 1;
            constructor() {
                super();
                State.declare(this, ['data']);
            }
        };
        expect(parent.data).toBe(1);
        const child = new class extends Mode {
            data!: number;
            constructor() {
                super();
                State.inherit(this, ['data']);
            }
        };
        parent.addChild(child);
        expect(child.data).toBe(1);
        child.data = 2;
        expect(parent.data).toBe(2);
        parent.removeChild(child);
        expect(parent.data).toBe(1);
    });*/
});
