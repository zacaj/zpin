import { Tree } from './tree';
import { MachineOutputs } from './machine';
import { Log } from './log';
import { Group } from 'aminogfx-gl';

export enum Modes {
    None,
    AttractMode,

    Game,

    Ball,

    Player,
    MiniPf,

    LockLit,
    GameMode,
    Multiball,
    Poker,

    Skillshot,
    NoMode,
    Restart,

    Bonus,

    PlayerOverrides,
    MachineOverrides,
}

export abstract class Mode extends Tree<MachineOutputs> {
    gPriority!: number;

    gfx?: Group;

    constructor(
        type: Modes,
        // public gfx: Group|undefined = createGroup(),
    ) {
        super(type);

        Log.info(['game', 'console', 'switch'], 'create mode %s', this.constructor.name);
    }

    started() {
        Log.log('game', 'start mode %s', this.constructor.name);
        super.started();
        // if (this instanceof Mode)
        //     this.gfx?.add(node.gfx!);    
    }

    end() {
        Log.log('game', 'end mode %s', this.constructor.name);
        // if (this.gfx) 
        //     this.gfx.parent?.remove(this.gfx);
        return super.end();
    }
}