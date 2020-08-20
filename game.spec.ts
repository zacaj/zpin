import { machine } from './machine';
import { playRecording, continueRecording, testRecording, finishRecording } from './recording';
import { snapshot } from './jest';

describe('game', () => {
    test('close diverter on orbit', async () => {
        await testRecording('orbit gate', 'break');
        expect(machine.cShooterDiverter.val).toBe(true);
        await continueRecording('break');
        expect(machine.cShooterDiverter.val).toBe(false);
        await finishRecording();
        expect(machine.cShooterDiverter.val).toBe(true);
        snapshot();
    });
});