import { Event, onType } from './events';

describe('events', () => {
    test('onType', () => {
        class E1 extends Event {}
        class E2 extends Event {}
        const pred = onType(E1);
        expect(pred(new E1())).toBe(true);
        expect(pred(new E2())).toBe(false);
    });
});