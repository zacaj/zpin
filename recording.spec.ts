import { initRecording, playRecording, testRecording } from './recording';
import { matrix } from './switch-matrix';
import { machine } from './machine';
import { Color } from './light';
import { initMachine } from './init';
import { Log } from './log';
import { MPU } from './mpu';

describe('recordings', () => {
    test('reading', async () => {
        const shooter = jest.spyOn(matrix[0][0]!, 'changeState');
        const right4 = jest.spyOn(matrix[2][2]!, 'changeState');
        const right3 = jest.spyOn(matrix[3][2]!, 'changeState');
        const right1 = jest.spyOn(matrix[5][2]!, 'changeState');
        expect(matrix[3][2]?.name).toBe('right 3');

        initRecording('./recordings/test-1.rec');
        await playRecording();

        expect(shooter).lastCalledWith(true, expect.stringContaining('recording'));
        expect(shooter).lastReturnedWith(expect.objectContaining({when: 5701}));
        expect(right4).lastCalledWith(false, expect.stringContaining('recording'));
        expect(right4).lastReturnedWith(expect.objectContaining({when: 11996}));
        expect(right3).lastCalledWith(false, expect.stringContaining('recording'));
        expect(right3).lastReturnedWith(expect.objectContaining({when: 11063}));
        expect(right1).lastCalledWith(false, expect.stringContaining('recording'));
        expect(right1).lastReturnedWith(expect.objectContaining({when: 9894}));
    });
    test('play test', async () => {
        await testRecording('test-1');
        expect(machine.out!.treeValues.lEjectStartMode).toEqual([Color.Red]);
    });
});