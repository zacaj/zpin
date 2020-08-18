import { Tree } from './tree';
import { Events, Event } from './events';
import { MachineOutputs } from './machine';
import { Log } from './log';
import { Group } from 'aminogfx-gl';
import { createGroup } from './gfx';
import { AttractMode } from './attract';
import { assert } from './util';

export enum Modes {
    AttractMode,

    Game,

    Ball,

    Player,

    LockLit,
    Multiball,
    Poker,

    Skillshot,

    GameOverrides,
    MachineOverrides,
}

export abstract class Mode<Outs extends {} = Partial<MachineOutputs>> extends Tree<Outs> {
    gPriority!: number;

    constructor(
        type: Modes,
        public gfx: Group|undefined = createGroup(),
    ) {
        super(type);

        Log.log(['game', 'console', 'switch'], 'start mode %s', this.constructor.name);
    }

    addChild<T extends Tree<Outs>>(node: T, priority?: number): T {
        super.addChild(node, priority);
        if (node instanceof Mode)
            this.gfx?.add(node.gfx!);
        return node;
    }
    removeChild<T extends Tree<Outs>>(node: T): T {
        super.removeChild(node);
        if (node instanceof Mode)
            this.gfx?.remove(node.gfx!);
        return node;
    }

    end() {
        Log.log('game', 'end mode %s', this.constructor.name);
        return super.end();
    }
}