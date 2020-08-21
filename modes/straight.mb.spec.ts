import { machine } from '../machine';
import { testRecording, finishRecording } from '../recording';
import { passTime } from '../timer';
import { snapshot } from '../jest';

describe('straight mb', () => {
    test('ramp lowers', async () => {
        await testRecording('lightStraight');
        expect(machine.cRamp.val).toBe(false);
        snapshot();
    });
    test('lock holds ball', async () => {
        await testRecording('straightMbStarting');
        await passTime(10000);
        expect(machine.cLockPost.lastActualChange).toBe(undefined);
        snapshot();
    });
});