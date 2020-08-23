import { Suit, Card, findPairs, findFlushes, findStraights, bestHand, compareHands, Poker } from './poker';
import { num } from '../util';
import { machine } from '../machine';
import { playRecording, continueRecording, testRecording, finishRecording } from '../recording';
import { passTime } from '../timer';
import { settleForks } from '../promises';
import { snapshot } from '../jest';
import { Rng } from '../rand';

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

    test.skip('probabilities', () => {
        let numStraights = 0;
        let numFlushes = 0;
        let numPairs = 0;
        let numTwoPairs = 0;
        let numThrees = 0;
        let numFullHouses = 0;
        let numNothing = 0;
        const runs = 10000;
        const rng = new Rng('pinball');
        for (let i=0; i<runs; i++) {
            const deck = Poker.makeDeck(rng).slice(0, 20+2);
            const play = deck.slice();
            play.shuffle();
            const hand = play.slice(0, 7);
            const flushes = findFlushes(hand);
            const straights = findStraights(hand);
            const pairs = findPairs(hand);
            const pair2 = pairs.filter(x => x.length === 2);
            const pair3 = pairs.filter(x => x.length === 3);
            numStraights += straights.length > 0? 1:0;
            numFlushes += flushes.length > 0? 1:0;
            numPairs += pair2.length > 0? 1:0;
            numThrees += pair3.length > 0? 1:0;
            numFullHouses += pair3.length * pair2.length > 0? 1:0;
            numTwoPairs += pair2.length * (pair2.length-1) > 0? 1:0;
            numNothing += !straights.length && !flushes.length && !pairs.length? 1:0;
        }
        console.log('Straights: %i    %f%%', numStraights, (numStraights/runs*100).toFixed(0));
        console.log('Flushes: %i    %f%%', numFlushes, (numFlushes/runs*100).toFixed(0));
        console.log('Pairs: %i    %f%%', numPairs, (numPairs/runs*100).toFixed(0));
        console.log('TwoPairs: %i    %f%%', numTwoPairs, (numTwoPairs/runs*100).toFixed(0));
        console.log('Threes: %i    %f%%', numThrees, (numThrees/runs*100).toFixed(0));
        console.log('FullHouses: %i    %f%%', numFullHouses, (numFullHouses/runs*100).toFixed(0));
        console.log('Nothing: %i    %f%%', numNothing, (numNothing/runs*100).toFixed(0));
    });

    
    test('close diverter during deal', async () => {
        await testRecording('close gate during deal', 'break');
        expect(machine.cShooterDiverter.val).toBe(true);
        await finishRecording();
        await passTime(10);
        expect(machine.cShooterDiverter.val).toBe(false);
        await passTime(5000);
        expect(machine.cShooterDiverter.val).toBe(true);
        snapshot();
    });

    test('dont eject during cards', async () => {
        await testRecording('upperEjectBlock');
        await passTime(1000);
        expect(machine.cUpperEject.val).toBe(false);
        expect(machine.cUpperEject.lastActualChange).toBe(undefined);
        snapshot();
    });
});