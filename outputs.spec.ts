import { Events } from './events';
import { State, Tree } from './state';
import { Mode } from './mode';
import { Outputs } from './outputs';

describe('outputs', () => {
    test('creates outputs', () => {
        const obj = new class extends Mode<{rampUp: boolean}> {
            up = false;

            constructor() {
                super();

                this.out = new Outputs(this, {
                    rampUp: () => this.up,
                });
            }
        };
        expect(Outputs.computeTreeValue(obj, 'rampUp')).toBe(false);
        obj.up = true;
        expect(Outputs.computeTreeValue(obj, 'rampUp')).toBe(true);
    });
    test('watches state', () => {
        const fire = jest.spyOn(Events, 'fire');
        const obj = new class extends Mode<{rampUp: boolean}> {
            up = false;

            constructor() {
                super();

                State.declare<any>(this, ['up']);

                this.out = new Outputs(this, {
                    rampUp: () => this.up,
                });
            }
        };

        expect(obj.out!.treeValues.rampUp).toBe(false);
        expect(fire).toBeCalledWith(expect.objectContaining({
            on: obj.out,
            prop: 'rampUp',
            value: false,
        }));
        expect(fire).toBeCalledWith(expect.objectContaining({
            tree: obj,
            prop: 'rampUp',
            value: false,
        }));
        fire.mockClear();
        obj.up = true;
        expect(obj.out!.treeValues.rampUp).toBe(true);
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
        expect(fire).toBeCalledWith(expect.objectContaining({
            tree: obj,
            prop: 'rampUp',
            value: true,
        }));
    });
    test('inherits outputs 1', () => {
        const fire = jest.spyOn(Events, 'fire');
        const parent = new class extends Mode<{rampUp: boolean}> {
            constructor() {
                super();

                this.out = new Outputs(this, {
                    rampUp: false,
                });
            }
        };
        const c1 = new class extends Mode<{rampUp: boolean}> {
            constructor() {
                super(parent);

                this.out = new Outputs(this, {
                    rampUp: true,
                });
            }
        };
        expect(parent.out!.treeValues.rampUp).toBe(true);
    });
    test('inherits outputs 2', () => {
        const fire = jest.spyOn(Events, 'fire');
        const parent = new class extends Mode<{rampUp: boolean}> {
            constructor() {
                super();

                this.out = new Outputs(this, {
                    rampUp: false,
                });
            }
        };
        const c1 = new class extends Mode<{rampUp: boolean}> {
            constructor() {
                super();

                this.out = new Outputs(this, {
                    rampUp: true,
                });
            }
        };
        parent.addChild(c1);
        expect(parent.out!.treeValues['rampUp']).toBe(true);
    });
    test('resets output if child is removed', () => {
        const fire = jest.spyOn(Events, 'fire');
        const parent = new class extends Mode<{rampUp: boolean}> {
            constructor() {
                super();

                this.out = new Outputs(this, {
                    rampUp: false,
                });
            }
        };
        const c1 = new class extends Mode<{rampUp: boolean}> {
            constructor() {
                super();

                this.out = new Outputs(this, {
                    rampUp: true,
                });
            }
        };
        parent.addChild(c1);
        expect(parent.out!.treeValues['rampUp']).toBe(true);
        c1.end();
        expect(parent.out!.treeValues['rampUp']).toBe(false);
    });

    test('compute 1', () => {
        const root = new class extends Mode<{num: number}> {
            constructor() {
                super();

                this.out = new Outputs(this, {
                    num: 0,
                });
            }
        };
        const c1 = new class extends Mode<{num: number}> {
            constructor() {
                super(root, 1);

                this.out = new Outputs(this, {
                    num: 1,
                });
            }
        };
        const c2 = new class extends Mode<{num: number}> {
            constructor() {
                super(root);

                this.out = new Outputs(this, {
                    num: 2,
                });
            }
        };
        expect(root.out!.treeValues.num).toBe(1);
        expect(Outputs.computeTreeValue(root, 'num')).toBe(1);
    });
    test('compute 2', () => {
        const root = new class extends Mode<{num: number}> {
            constructor() {
                super();

                this.out = new Outputs(this, {
                    num: 0,
                });
            }
        };
        const c1 = new class extends Mode<{num: number}> {
            constructor() {
                super(root, 1);

                this.out = new Outputs(this, {
                    num: 1,
                });
            }
        };
        const c2 = new class extends Mode<{num: number}> {
            constructor() {
                super(root, 2);

                this.out = new Outputs(this, {
                    num: 2,
                });
            }
        };
        expect(root.out!.treeValues.num).toBe(2);
        expect(Outputs.computeTreeValue(root, 'num')).toBe(2);
    });
    test('compute 3', () => {
        const root = new class extends Mode<{num: number}> {
            constructor() {
                super();

                this.out = new Outputs(this, {
                    num: 0,
                });
            }
        };
        const c1 = new class extends Mode<{num: number}> {
            constructor() {
                super(root, 1);

                this.out = new Outputs(this, {
                    num: 1,
                });
            }
        };
        const c2 = new class extends Mode<{num: number}> {
            constructor() {
                super(root);

                this.out = new Outputs(this, {
                    num: 2,
                });
            }
        };
        const c3 = new class extends Mode<{num: number}> {
            constructor() {
                super(c2, 3);

                this.out = new Outputs(this, {
                    num: 3,
                });
            }
        };
        expect(root.out!.treeValues.num).toBe(1);
        expect(Outputs.computeTreeValue(root, 'num')).toBe(1);
    });
    test('compute 4', () => {
        const root = new class extends Mode<{num: number}> {
            constructor() {
                super();

                this.out = new Outputs(this, {
                    num: 0,
                });
            }
        };
        const c1 = new class extends Mode<{num: number}> {
            constructor() {
                super(root, 1);

                this.out = new Outputs(this, {
                    num: 1,
                });
            }
        };
        const c2 = new class extends Mode<{num: number}> {
            constructor() {
                super(root, 2);

                this.out = new Outputs(this, {
                    num: 2,
                });
            }
        };
        const c3 = new class extends Mode<{num: number}> {
            constructor() {
                super(c2, 0);

                this.out = new Outputs(this, {
                    num: 3,
                });
            }
        };
        expect(root.out!.treeValues.num).toBe(3);
        expect(Outputs.computeTreeValue(root, 'num')).toBe(3);
    });
    test('compute 5', () => {
        const root = new class extends Tree<{num: number}> {
            constructor() {
                super();

                this.out = new Outputs(this, {
                    num: 0,
                });
            }
        };
        const c1 = new class extends Tree<{num: number}> {
            n?: number = 1;
            constructor() {
                super(root, 1);
                State.declare<any>(this, ['n']);

                this.out = new Outputs(this, {
                    num: () => this.n,
                });
            }
        };
        expect(root.out!.treeValues.num).toBe(1);
        c1.n = undefined;
        expect(root.out!.treeValues.num).toBe(0);
    });
});
