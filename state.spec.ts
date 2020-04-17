import { Events } from './events';
import { State, StateEvent } from './state';
import { SwitchEvent } from './switch-matrix';
import { Tree } from './tree';

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
        const fire = jest.spyOn(Events, 'fire').mockReturnValue();
        const obj = new class extends Tree {
            data = [0, 1];

            constructor() {
                super();
                State.declare<any>(this, ['data']);
            }
        };
        expect(obj.data[0]).toBe(0);
        fire.mockReset();

        obj.data[0] = 1;
        expect(obj.data[0]).toBe(1);
        expect(fire).toBeCalledTimes(1);
        obj.data[0] = 0;
        fire.mockReset();

        obj.data.push(2);
        expect(obj.data[0]).toBe(0);
        expect(obj.data[2]).toBe(2);
        expect(fire).toBeCalledTimes(1);
        fire.mockReset();

        obj.data.unshift(-1);
        expect(obj.data[0]).toBe(-1);
        expect(fire).toBeCalledTimes(4);
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
