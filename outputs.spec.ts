import { Events } from './events';
import { State, Tree } from './state';
import { Mode } from './mode';
import { makeOutputs, outputs, Outputs, computeOutputValue } from './outputs';

describe('outputs', () => {
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
        expect(fire).toBeCalledWith(expect.objectContaining({
            on: obj.out,
            prop: 'rampUp',
            value: false,
        }));
        fire.mockClear();
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
    test('inherits outputs', () => {
        const fire = jest.spyOn(Events, 'fire');
        const parent = new class extends Mode implements Tree {
            out: Outputs = {
                currentValues: outputs,
                owner: this,
            };
        
            constructor() {
                super();
            }
        };
        const c1 = new class extends Mode implements Tree {
            out = makeOutputs({
                rampUp: () => true,
            }, this);
            constructor() {
                super();
            }
        };
        parent.addChild(c1);
        expect(outputs.rampUp).toBe(true);
    });

    test('compute', () => {
        const root: Tree = {
            children: [
                {
                    children: [],
                    out: {
                        rampUp: () => true,
                    } as any,
                    priority: 1,
                },
                {
                    children: [],
                    out: {
                        rampUp: () => false,
                    } as any,
                },
            ],
        };
        expect(computeOutputValue(root, 'rampUp')).toBe(true);
    });
});
