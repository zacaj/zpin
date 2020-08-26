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
        const upper3a = jest.spyOn(matrix[2][5]!, 'changeState');
        expect(matrix[3][2]?.name).toBe('right 3');

        initRecording('./recordings/test-1.rec');
        await playRecording();

        expect(shooter).lastCalledWith(true, expect.stringContaining('recording'));
        expect(shooter).lastReturnedWith(expect.objectContaining({when: 2503}));
        expect(right4).lastCalledWith(true, expect.stringContaining('recording'));
        expect(right4).lastReturnedWith(expect.objectContaining({when: 7319}));
        expect(right3).lastCalledWith(true, expect.stringContaining('recording'));
        expect(right3).lastReturnedWith(expect.objectContaining({when: 8836}));
        expect(upper3a).lastCalledWith(true, expect.stringContaining('recording'));
        expect(upper3a).lastReturnedWith(expect.objectContaining({when: 13093}));
    });
    test('play test', async () => {
        await testRecording('lightStraight');
        expect(machine.out!.treeValues.lEjectStartMode).toEqual([Color.White]);
    });
});