import { Events, StateEvent } from './events';
import { State } from './state';
import { SwitchEvent } from './switch-matrix';
import { Tree } from './tree';
import { Outputs } from './outputs';

describe('state', () => {
    test('fires events', () => {
        const fire = jest.spyOn(Events, 'fire').mockReturnValue();
        const obj = new class extends Tree {
            data = 1;

            constructor() {
                super();
                State.declare<any>(this, ['data']);
            }
        };
        expect(obj.data).toBe(1);
        obj.data = 2;
        expect(obj.data).toBe(2);
        expect(fire).toBeCalled();
    });
    test('watches arrays', () => {
        let changed1: jest.Mock;
        let changed2: jest.Mock;
        const obj = new class extends Tree<{x: number; y: number}> {
            data = [0, 1];

            constructor() {
                super();
                this.makeRoot();
                State.declare<any>(this, ['data']);
                changed1 = jest.fn(() => this.data[0] === 0);
                changed2 = jest.fn(() => this.data.find(x => false));

                this.out = new Outputs(this, {
                    x: changed1,
                    y: changed2,
                });
            }
        };
        expect(obj.data[0]).toBe(0);
        changed1!.mockReset();
        changed2!.mockReset();

        obj.data[0] = 1;
        expect(obj.data[0]).toBe(1);
        expect(changed1!).toBeCalled();
        expect(changed2!).toBeCalled();
        obj.data[0] = 0;
        changed1!.mockReset();
        changed2!.mockReset();

        obj.data.push(2);
        expect(obj.data[0]).toBe(0);
        expect(obj.data[2]).toBe(2);
        expect(changed1!).toBeCalled();
        expect(changed2!).toBeCalled();
        changed1!.mockReset();
        changed2!.mockReset();

        obj.data.unshift(-1);
        expect(obj.data[0]).toBe(-1);
        expect(changed1!).toBeCalled();
        expect(changed2!).toBeCalled();
    });
    test('watches objects', () => {
        let changed: jest.Mock;
        const obj = new class extends Tree {
            data: any = {
                x: 3,
            };

            constructor() {
                super();
                this.makeRoot();
                State.declare<any>(this, ['data']);
                changed = jest.fn(() => this.data.x === 3);

                this.out = new Outputs(this, {
                    x: changed,
                });
            }
        };
        expect(obj.data.x).toBe(3);
        changed!.mockReset();

        obj.data.x++;
        expect(obj.data.x).toBe(4);
        expect(changed!).toBeCalled();
        changed!.mockReset();

        obj.data.y = 1;
        expect(obj.data.x).toBe(4);
        expect(obj.data.y).toBe(1);
        expect(changed!).toBeCalled();
        changed!.mockReset();

        obj.data = { x: 4 };
        expect(obj.data.x).toBe(4);
        expect(changed!).toBeCalled();
        changed!.mockReset();
    });
    test('watches sets', () => {
        let changed: jest.Mock;
        const obj = new class extends Tree {
            data = new Set<number>();

            constructor() {
                super();
                this.makeRoot();
                State.declare<any>(this, ['data']);
                changed = jest.fn(() => this.data.has(0));

                this.out = new Outputs(this, {
                    x: changed,
                });
            }
        };
        expect(obj.data.has(1)).toBe(false);
        changed!.mockReset();

        obj.data.add(1);
        expect(obj.data.has(1)).toBe(true);
        expect(changed!).toBeCalled();
        changed!.mockReset();

        obj.data.add(2);
        expect(obj.data.has(1)).toBe(true);
        expect(obj.data.has(2)).toBe(true);
        expect(changed!).toBeCalled();
        changed!.mockReset();
    });
    test('watches Set.size', () => {
        let changed: jest.Mock;
        const obj = new class extends Tree {
            data = new Set<number>();

            constructor() {
                super();
                this.makeRoot();
                State.declare<any>(this, ['data']);
                changed = jest.fn(() => this.data.size);

                this.out = new Outputs(this, {
                    x: changed,
                });
            }
        };
        expect(obj.data.has(1)).toBe(false);
        changed!.mockReset();

        obj.data.add(1);
        expect(obj.data.has(1)).toBe(true);
        expect(changed!).toBeCalled();
        changed!.mockReset();
    });
    test('attaches events for members', () => {
        const obj = new class extends Tree {
            constructor() {
                super();
            }

            onSwitch(e: SwitchEvent) {
                
            }

            onState(e: StateEvent<any, any>) {
                
            }
        };

        const sw = jest.spyOn(obj, 'onSwitch');
        const st = jest.spyOn(obj, 'onState');
        obj.handleEvent(new SwitchEvent({} as any));
        expect(sw).toBeCalled();
        expect(st).not.toBeCalled();
        sw.mockReset();
        obj.handleEvent(new StateEvent<any, any>({} as any, '' as any, undefined, undefined));
        expect(st).toBeCalled();
        expect(sw).not.toBeCalled();
    });
});
