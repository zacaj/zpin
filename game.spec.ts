import { Game } from './game';
import { setTime, passTime } from './state';
import { machine } from './machine';

describe('game', () => {
    test('resets upper 3 bank', () => {
        const cUpper3Fire = jest.spyOn(machine.cUpper3, 'fire').mockResolvedValue(true);
        jest.spyOn(machine.cRamp, 'set').mockResolvedValue(true);
        setTime(1);
        const game = Game.start();
        expect(game.out!.treeValues.upper3).toBe(false);

        passTime();
        machine.sUpper3[0].changeState(true);
        expect(game.out!.treeValues.upper3).toBe(false);
        passTime();
        machine.sUpper3[1].changeState(true);
        expect(game.out!.treeValues.upper3).toBe(false);
        passTime();
        machine.sUpper3[2].changeState(true);
        expect(game.out!.treeValues.upper3).toBe(false);

        expect(cUpper3Fire).not.toBeCalled();

        passTime(255);
        expect(game.out!.treeValues.upper3).toBe(true);
        expect(machine.cUpper3.val).toBe(true);

        expect(cUpper3Fire).toBeCalledTimes(1);


        passTime();
        machine.sUpper3[0].changeState(false);
        expect(game.out!.treeValues.upper3).toBe(true);
        passTime();
        machine.sUpper3[1].changeState(false);
        expect(game.out!.treeValues.upper3).toBe(true);
        passTime(1000);
        expect(cUpper3Fire).toBeCalledTimes(2);
        machine.sUpper3[2].changeState(false);
        expect(game.out!.treeValues.upper3).toBe(true);

        passTime(255);
        expect(game.out!.treeValues.upper3).toBe(false);

        expect(cUpper3Fire).toBeCalledTimes(2);
    });
});