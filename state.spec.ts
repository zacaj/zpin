import { Events } from './events';
import { State, Tree } from './state';
import { Mode } from './game';
import { makeOutputs, outputs } from './outputs';

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
    test('creates outputs', () => {
        const obj = new class extends Mode implements Tree {
            up = false;
            out = makeOutputs({
                rampUp: () => this.up,
            }, this);
        };
        expect(obj.out.rampUp).toBe(false);
        obj.up = true;
        expect(obj.out.rampUp).toBe(true);
    });
    test('watches outputs', () => {
        const fire = jest.spyOn(Events, 'fire');
        const obj = new class extends Mode implements Tree {
            up = false;
            out = makeOutputs({
                rampUp: () => this.up,
            }, this);
            constructor() {
                super();
                State.declare(this, ['up']);
            }
        };
        expect(obj.out.rampUp).toBe(false);
        obj.up = true;
        expect(obj.out.rampUp).toBe(true);
        expect(fire).toBeCalledWith(expect.objectContaining({
            on: obj,
            prop: 'up',
            value: true,
        }));
        expect(fire).toBeCalledWith(expect.objectContaining({
            on: obj.out,
            prop: 'rampUp',
            value: true,
        }));
        // expect(fire).toBeCalledWith(expect.objectContaining({
        //     on: outputs,
        //     prop: 'rampUp',
        //     value: true,
        // }));
        // expect(outputs.rampUp).toBe(true);
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
