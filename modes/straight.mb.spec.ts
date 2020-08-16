import { machine } from '../machine';
import { testRecording, finishRecording } from '../recording';

describe('straight mb', () => {
    test('ramp lowers', async () => {
        await testRecording('lightStraight');
        expect(machine.cRamp.val).toBe(false);
    });
});