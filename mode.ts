import { Tree } from './state';
import { Events, Event } from './events';

export abstract class Mode<T extends {}> extends Tree<T> {
    constructor(
        parent?: Tree<T>,
        priority = 0,
    ) {
        super(parent, priority);
    }
}