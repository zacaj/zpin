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
    test('first short plunge doesnt trigger skillsot', async () => {
        await testRecording('straightMbSkillRamp');
        await passTime(1000);
        expect(machine.cLockPost.lastValChange).toBe(undefined);
        expect(machine.cRamp.val).toBe(false);
        snapshot();
    });
    test('second short plunge does trigger skillsot', async () => {
        await testRecording('straightMbSkillStart');
        await passTime(1000);
        expect(machine.cLockPost.lastValChange).not.toBe(undefined);
        expect(machine.cRamp.val).toBe(true);
        snapshot();
    });
    test('lock holds ball', async () => {
        await testRecording('straightMbStarting');
        await passTime(10000);
        expect(machine.cLockPost.lastValChange).toBe(undefined);
        snapshot();
    });
    test('bug: ramp still flashing after choosing different skill award', async () => {
        await testRecording('bug_straightAddRampStillFlashing');
        await passTime(10000);
        expect(machine.lRampArrow.lit()).toBe(false);
    });
    test('mb add a ball outlane drain', async () => {
        await testRecording('mbAddADrain');
        await passTime(10000);
        expect(machine.cLockPost.lastValChange).not.toBe(undefined);
        snapshot();
    });
});