import { Tree } from './tree';
import { Events, Event } from './events';
import { MachineOutputs } from './machine';
import { Log } from './log';
import { Group } from 'aminogfx-gl';
import { gfx as agfx } from './gfx';

export abstract class Mode<T extends {} = Partial<MachineOutputs>> extends Tree<T> {
    constructor(
        priority = 0,
        public gfx: Group = new Group(agfx),
    ) {
        super(undefined, priority);

        Log.log('game', 'start mode %s', this.constructor.name);
    }

    addChild(node: Tree<T>, priority?: number): Tree<T> {
        super.addChild(node, priority);
        if (node instanceof Mode)
            this.gfx.add(node.gfx);
        return node;
    }
    removeChild(node: Tree<T>) {
        super.removeChild(node);
        if (node instanceof Mode)
            this.gfx.remove(node.gfx);
    }

    end() {
        Log.log('game', 'end mode %s', this.constructor.name);
        return super.end();
    }
}