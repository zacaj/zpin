import { Game } from './game';
import { machine } from './machine';
import { setTime, passTime } from './timer';

describe('game', () => {
    test('resets upper 3 bank', async () => {
        const cUpper3Fire = jest.spyOn(machine.cUpper3, 'fire');
        jest.spyOn(machine.solenoidBank2, 'fireSolenoidFor').mockResolvedValue('');
        jest.spyOn(machine.cRamp, 'set').mockResolvedValue(true);
        await setTime(1);
        const game = Game.start();
        expect(game.out!.treeValues.upper3).toBe(false);

        await passTime();
        machine.sUpper3[0].changeState(true);
        expect(game.out!.treeValues.upper3).toBe(false);
        await passTime();
        machine.sUpper3[1].changeState(true);
        expect(game.out!.treeValues.upper3).toBe(false);
        await passTime();
        machine.sUpper3[2].changeState(true);
        expect(game.out!.treeValues.upper3).toBe(false);

        expect(cUpper3Fire).not.toBeCalled();

        await passTime(255);
        expect(game.out!.treeValues.upper3).toBe(true);
        expect(machine.cUpper3.val).toBe(true);

        expect(cUpper3Fire).toBeCalledTimes(1);


        await passTime();
        machine.sUpper3[0].changeState(false);
        expect(game.out!.treeValues.upper3).toBe(true);
        await passTime();
        machine.sUpper3[1].changeState(false);
        expect(game.out!.treeValues.upper3).toBe(true);

        const m = machine;
        await passTime(1000);
        expect(cUpper3Fire).toBeCalledTimes(2);
        expect(game.out!.treeValues.upper3).toBe(true);
        machine.sUpper3[2].changeState(false);
        expect(game.out!.treeValues.upper3).toBe(true);

        await passTime(255);
        expect(game.out!.treeValues.upper3).toBe(false);

        expect(cUpper3Fire).toBeCalledTimes(2);
    });
});