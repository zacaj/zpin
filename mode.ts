import { Tree } from './state';
import { Events, Event } from './events';
import { MachineOutputs } from './machine';

export abstract class Mode<T extends {} = Partial<MachineOutputs>> extends Tree<T> {
    constructor(
        parent?: Tree<T>,
        priority = 0,
    ) {
        super(parent, priority);
    }
}