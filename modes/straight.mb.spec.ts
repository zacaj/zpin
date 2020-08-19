import { machine } from '../machine';
import { testRecording, finishRecording } from '../recording';
import { passTime } from '../timer';

describe('straight mb', () => {
    test('ramp lowers', async () => {
        await testRecording('lightStraight');
        expect(machine.cRamp.val).toBe(false);
    });
    test('lock holds ball', async () => {
        await testRecording('mbEarlyStart');
        await passTime(10000);
        expect(machine.cLockPost.lastActualChange).toBe(undefined);
    });
});