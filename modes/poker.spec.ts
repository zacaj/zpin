import { Suit, Card, findPairs, findFlushes, findStraights, bestHand, compareHands } from './poker';
import { num } from '../util';

describe('poker', () => {
    function hand(str: string): Card[] {
        return str.split(',').map(s => ({
            suit: s.charAt(s.length===3? 2:1) as Suit,
            num: num(s.slice(0, s.length-1)),
        }));
    }
    test('findPairs', () => {
        expect(findPairs(hand('2h,2d,3s'))).toEqual([hand('2h,2d')]);
        expect(findPairs(hand('2h,2d,3s,5s,1d'))).toEqual([hand('2h,2d')]);
        expect(findPairs(hand('2h,2d,3s,3d'))).toEqual([hand('3s,3d'), hand('2h,2d')]);
        expect(findPairs(hand('2h,2d,2s,2c'))).toEqual([hand('2h,2d,2s,2c')]);
        expect(findPairs(hand('2h,2d,2s,3s,3d'))).toEqual([hand('2h,2d,2s'), hand('3s,3d')]);
    });
    test('findFlushes', () => {
        expect(findFlushes(hand('3s,2h,3h,2s,5h,7h,9h'))).toEqual([hand('9h,7h,5h,3h,2h')]);
        expect(findFlushes(hand('10h,2h,3h,2s,5h,7h,9h'))).toEqual([hand('10h,9h,7h,5h,3h')]);
    });
    test('findStraights', () => {
        expect(findStraights(hand('3s,2h,6h,9s,5h,8h,4d'))).toEqual([hand('2h,3s,4d,5h,6h')]);
        expect(findStraights(hand('3s,2h,6h,9s,5h,7h,4d'))).toEqual([hand('3s,4d,5h,6h,7h'), hand('2h,3s,4d,5h,6h')]);
        expect(findStraights(hand('3s,2h,6h,2s,5h,8h,4d'))).toEqual([hand('2h,3s,4d,5h,6h'), hand('2s,3s,4d,5h,6h')]);
    });
    test('bestHand', () => {
        expect(bestHand(hand('3s,2h,6h,9s,5h,8h,4d'))).toEqual([hand('2h,3s,4d,5h,6h'), 4]);
        expect(bestHand(hand('10h,2h,3h,2s,5h,7h,9h'))).toEqual([hand('10h,9h,7h,5h,3h'), 5]);
        expect(bestHand(hand('2h,10h,3s,2d,2s,4d,3d'))).toEqual([hand('2h,2d,2s,3s,3d'), 6]);
        expect(bestHand(hand('2h,10h,3s,2d,5s,4d,3d'))).toEqual([hand('3s,3d,2h,2d'), 2]);
        expect(bestHand(hand('3h,10h,3s,2d,5s,4d,3d'))).toEqual([hand('3h,3s,3d'), 3]);
        expect(bestHand(hand('3s,2h,6h,9s,5h,8h,10d'))).toEqual([hand('10d'), 0]);
    });
    test('compareHands', () => {
        expect(compareHands(hand('3h,10h,3s,2d,5s,4d,3d'), hand('3s,2h,6h,9s,5h,8h,10d')).aWon).toBe(true);
        expect(compareHands(hand('3s,2h,6h,9s,5h,8h,10d'), hand('3h,10h,3s,2d,5s,4d,3d')).aWon).toBe(false);
    });
});