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
        bank.makeRoot();
        machine.addChild(bank);
        expect(bank.out!.treeValues.upper3).toBe(false);

        await passTime();
        machine.upper3Bank.targets[0].switch.state = true;
        expect(bank.out!.treeValues.upper3).toBe(false);
        await passTime();
        machine.upper3Bank.targets[1].switch.state = true;
        expect(bank.out!.treeValues.upper3).toBe(false);
        await passTime();
        machine.upper3Bank.targets[2].switch.state = true;
        await passTime(255);
        expect(bank.out!.treeValues.upper3).toBe(true);
        await passTime();
        expect(cUpper3Fire).toBeCalledTimes(1);


        await passTime();
        machine.upper3Bank.targets[0].switch.state = false;
        expect(bank.out!.treeValues.upper3).toBe(true);
        await passTime();
        machine.upper3Bank.targets[1].switch.state = false;
        expect(bank.out!.treeValues.upper3).toBe(true);

        await passTime(1500);
        expect(cUpper3Fire).toBeCalledTimes(2);
        expect(bank.out!.treeValues.upper3).toBe(true);
        machine.upper3Bank.targets[2].switch.state = false;
        await passTime(255);
        expect(bank.out!.treeValues.upper3).toBe(false);

        expect(cUpper3Fire).toBeCalledTimes(2);
    });
    test('resets upper 3 bank even if it was down beforehand', async () => {
        const cUpper3Fire = jest.spyOn(machine.cUpper3, 'fire');
        jest.spyOn(machine.solenoidBank2, 'fireSolenoidFor').mockResolvedValue('');
        await setTime(1);
        machine.upper3Bank.targets[0].switch.state = true;
        machine.upper3Bank.targets[1].switch.state = true;
        machine.upper3Bank.targets[2].switch.state = true;
        await passTime(2);

        const bank = new DropBankResetter(machine.upper3Bank);
        machine.addChild(bank);
        await passTime(255);
        expect(bank.out!.treeValues.upper3).toBe(true);

        expect(cUpper3Fire).toBeCalledTimes(1);
    });
});