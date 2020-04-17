import { Utils, split } from './util'
import { Tree } from './tree';
import { Outputs } from './outputs';
import { setTime, time, wait } from './timer';

describe('utils', () => {
    test('split', () => {
        expect(split('a1b23', '1', '2', '3')).toEqual(['a', 'b', '']);
    });
});