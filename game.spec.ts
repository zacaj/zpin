import { expectMachineOutputs, machine } from './machine'
import { Game } from './game';
import { getTypeIn } from './util';
import { DropBank } from './drop-bank';
import { passTime } from './timer';

describe('game', () => {
    test('resets drops', async () => {
        expectMachineOutputs('rampUp', 'upper3', 'centerBank', 'leftBank', 'rightBank', 'upper2', 'miniBank');
        const game = Game.start();
        for (const bank of getTypeIn<DropBank>(machine, DropBank)) {
            for (const sw of bank.targets.map(t => t.switch)) {
                sw.state = true;
            }
            await passTime(255);
            expect(bank.coil.set).toHaveBeenCalled();
        }
    });
});