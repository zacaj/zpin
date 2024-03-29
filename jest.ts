import { resetMachine, MachineOutputs, machine, Solenoid, Machine } from './machine';
import { resetSwitchMatrix } from './switch-matrix';
import { Events } from './events';
import { MPU } from './mpu';
import { Timer, setTime, wait } from './timer';
import { Log } from './log';
import { Tree } from './tree';
import { clone, objectMap } from './util';

beforeEach(async () => {
    jest.spyOn(Timer, 'schedule').mockRestore();
    jest.spyOn(Events, 'listen').mockRestore();
    jest.spyOn(Events, 'fire').mockRestore();
    jest.spyOn(Timer, 'callIn').mockRestore();
    jest.spyOn(Log, 'init').mockImplementation(() => { throw 'unexpected' });
    jest.spyOn(Log, 'write').mockReturnValue();
    jest.spyOn(Log, 'logMessage').mockReturnValue();
    jest.spyOn(Log, 'trace').mockReturnValue();
    Timer.reset();
    Events.resetAll();
    resetSwitchMatrix();
    resetMachine();
    jest.spyOn(machine, 'pfIsInactive').mockReturnValue(false);
    await setTime(1);
    jest.spyOn(MPU, 'sendCommandCode').mockImplementation(async (cmd) => {
        debugger;
        
        expect(cmd).toBe('mocked');

        return {
            code: 200,
            resp: 'mocked',
        };
    });
});

afterEach(async () => {
    Events.resetAll();
    Timer.reset();
    await setTime();
    jest.spyOn(Timer, 'callIn').mockReturnValue({} as any);
    jest.spyOn(Timer, 'schedule').mockReturnValue({} as any);
    jest.spyOn(Events, 'listen').mockReturnValue({} as any);
    jest.spyOn(Events, 'fire').mockReturnValue({} as any);
    await new Promise(r => setTimeout(r, 50));
});

export function snapshotOutputs(tree: Tree<any> = machine) {
    // const outs = JSON.stringify(tree.out!.treeValues, undefined, 2);
    expect(tree.out!.treeValues).toMatchSnapshot();
}

const statify = (tree: Tree<any>): {name: string; state: any; children: any} => {
    const state = (tree as any).$state;
    const obj = Object.create({}) as any;
    // // Object.defineProperty(obj.__proto__, 'constructor', { value: Object.create(obj)});
    // Object.defineProperty(obj.__proto__, 'name', { value: tree.name+tree.num });
    obj.name = tree.name+tree.num;
    obj._name = tree.name+tree.num;
    obj.state = objectMap(state?.data??{}, val => (val as any)?.$isProxy? 
            ((val as any).constructor.name==='Object'? clone(val) : [...(val as any).original].map(val => (val instanceof Tree? val.name+val.num : val))) 
            : (val instanceof Tree? val.name+val.num : val));
    obj.children = tree.children.map(statify);
    obj.ownOuts = tree.out?.ownValues;
    
    return obj;
};
export function snapshotState(tree: Tree<any> = machine) {
    expect(statify(tree)).toMatchSnapshot();
}

export function snapshot(tree: Tree<any> = machine) {
    expect({
        outputs: tree.out!.treeValues,
        state: statify(tree),
    }).toMatchSnapshot();
}