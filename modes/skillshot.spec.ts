import { machine } from '../machine';
import { testRecording, finishRecording } from '../recording';
import { snapshotOutputs, snapshotState, snapshot } from '../jest';

describe('skillshot', () => {
    test('close diverter on first switch hit', async () => {
        await testRecording('lower skillshot', 'break');
        expect(machine.cShooterDiverter.val).toBe(false);
        await finishRecording();
        expect(machine.cShooterDiverter.val).toBe(true);
        snapshot();
    });
});