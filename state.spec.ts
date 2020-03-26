import { Events } from './events';
import { State, Tree } from './state';

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
});
