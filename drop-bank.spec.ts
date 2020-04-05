import { Game } from './game';
import { machine } from './machine';
import { setTime, passTime } from './timer';
import { DropBankResetter } from './drop-bank';

describe('drops', () => {
    test('resets upper 3 bank', async () => {
        const cUpper3Fire = jest.spyOn(machine.cUpper3, 'fire');
        jest.spyOn(machine.solenoidBank2, 'fireSolenoidFor').mockResolvedValue('');
        await setTime(1);
        const bank = new DropBankResetter(machine.upper3Bank);
        machine.addChild(bank);
        expect(bank.out!.treeValues.upper3).toBe(false);

        await passTime();
        machine.upper3Bank.targets[0].switch.changeState(true);
        expect(bank.out!.treeValues.upper3).toBe(false);
        await passTime();
        machine.upper3Bank.targets[1].switch.changeState(true);
        expect(bank.out!.treeValues.upper3).toBe(false);
        await passTime();
        machine.upper3Bank.targets[2].switch.changeState(true);
        expect(bank.out!.treeValues.upper3).toBe(true);
        await passTime();
        expect(cUpper3Fire).toBeCalledTimes(1);


        await passTime();
        machine.upper3Bank.targets[0].switch.changeState(false);
        expect(bank.out!.treeValues.upper3).toBe(true);
        await passTime();
        machine.upper3Bank.targets[1].switch.changeState(false);
        expect(bank.out!.treeValues.upper3).toBe(true);

        await passTime(1500);
        expect(cUpper3Fire).toBeCalledTimes(2);
        expect(bank.out!.treeValues.upper3).toBe(true);
        machine.upper3Bank.targets[2].switch.changeState(false);
        await passTime();
        expect(bank.out!.treeValues.upper3).toBe(false);

        expect(cUpper3Fire).toBeCalledTimes(2);
    });
    test('resets upper 3 bank even if it was down beforehand', async () => {
        const cUpper3Fire = jest.spyOn(machine.cUpper3, 'fire');
        jest.spyOn(machine.solenoidBank2, 'fireSolenoidFor').mockResolvedValue('');
        await setTime(1);
        machine.upper3Bank.targets[0].switch.changeState(true);
        machine.upper3Bank.targets[1].switch.changeState(true);
        machine.upper3Bank.targets[2].switch.changeState(true);
        await passTime(2);

        const bank = new DropBankResetter(machine.upper3Bank);
        machine.addChild(bank);
        await passTime(1);
        expect(bank.out!.treeValues.upper3).toBe(true);

        expect(cUpper3Fire).toBeCalledTimes(1);
    });
});