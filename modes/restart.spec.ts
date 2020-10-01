import { machine } from '../machine';
import { testRecording, finishRecording } from '../recording';
import { passTime } from '../timer';
import { snapshot } from '../jest';

describe('restart', () => {
    test('light goes away', async () => {
        await testRecording('restartFailedPoker');
        expect(machine.out!.treeValues.lRampArrow).toEqual([]);
        snapshot();
    });
});