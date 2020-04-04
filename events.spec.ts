import { Event, onType, Events } from './events';

describe('events', () => {
    test('onType', () => {
        class E1 extends Event {}
        class E2 extends Event {}
        const pred = onType(E1);
        expect(pred(new E1())).toBe(true);
        expect(pred(new E2())).toBe(false);
    });
    test('removes listener', () => {
        const spy = Events.listen(jest.fn().mockReturnValue('remove'), e => true);
        Events.fire(new class extends Event { });
        expect(spy).toBeCalled();
        spy.mockClear();
        Events.fire(new class extends Event { });
        expect(spy).not.toBeCalled();
    });
    test('gets name', () => {
        class E1 extends Event {}
        const e = new E1();
        expect(e.name).toBe('E1');
    });
});