import { Event, Events, onType, EventTypePredicate } from './events';
import { StateEvent, State } from './state';
import { Utils, assert, selectiveClone, eq } from './util';
import { time } from './timer';
import { Log } from './log';
import { Tree, TreeEvent } from './tree';

type OutputFuncs<OutputTypes extends {}> = {
    [key in keyof OutputTypes]?: (prev?: OutputTypes[key]) => OutputTypes[key]|undefined;
};

type OutputFuncsOrValues<OutputTypes extends {}> = {
    [key in keyof OutputTypes]?: ((prev?: OutputTypes[key]) => OutputTypes[key]|undefined)|OutputTypes[key];
};
// type Outputs<OutputTypes extends {}> = OutputFuncs<OutputTypes> & {
//     currentValues: Partial<OutputTypes>;
//     owner: Tree;
// };

export class Outputs<Outs extends {}> {
    ownValues!: Partial<Outs>;
    treeValues!: Outs;
    funcs!: OutputFuncs<Outs>;
    funcParam!: { [key in keyof Outs]: boolean};
    originalValues!: Partial<Outs>;

    // state -> stateKey -> our key that listens to it
    listeners = new Map<{}, Map<string, Set<keyof Outs>>>();

    constructor(
        public readonly tree: Tree<Outs>,
        public origFuncs: OutputFuncsOrValues<Outs>,
        abstract?: true,
    ) {
        if (abstract) return;
        if (tree.out) {
            const parent = {...tree.out.origFuncs} as any;
            Object.keys(origFuncs).forEach(key => delete parent[key]);
            Object.assign(origFuncs, parent);
        }
        this.funcs = {} as any;
        this.ownValues = {} as any;
        this.funcParam = {} as any;
        this.treeValues = {} as any;
        this.originalValues = {} as any;
        tree.out = this;

        this.tree.listen<StateEvent<any, any>>(ev => {
                if (!(ev instanceof StateEvent)) return false;
                const l1 = this.listeners.get(ev.on); // keys on state we listen to
                if (!l1) return false;
                const outs = l1.get(ev.prop); // which of our funcs listen
                if (!outs?.size) return false;
                return true;
            },
            ev => {
                for (const key of this.listeners.get(ev.on)!.get(ev.prop)!) {
                    this.ownValueMayHaveChanged(key);
                }
            });

        // catch child tree structure changes
        this.tree.listen<TreeEvent<any>>(e => e instanceof TreeEvent
            && (this.tree.hasChild(e.before)
                || this.tree.hasChild(e.after)
                || e.before.hasParent(this.tree)
                || e.after.hasParent(this.tree)
            ),
            ev => {
                if (ev.after.parent)
                    this.checkChildChange(ev.after);
                if (ev.before.parent)
                    this.checkChildChange(ev.before);
            });

        // catch child tree value changes
        this.tree.listen((e: Event) => e instanceof OwnOutputEvent && this.tree.isOrHasChild(e.on.tree) && e.prop in this.funcs,
            (ev: OwnOutputEvent<Outs>) => this.updateTreeValue(ev.prop));


        State.declare<any>(this.treeValues, Object.keys(origFuncs));
        State.declare<any>(this.ownValues, Object.keys(origFuncs));

        const listeners = this.listeners;
        for (const key of Object.keys(origFuncs) as (keyof Outs)[]) {
            this.funcs[key] = ((prev: any) => {
                { // begin recording
                    Utils.stateAccessRecorder = (state, k) => {
                        if (!listeners.has(state))
                            listeners.set(state, new Map());
                        if (!listeners.get(state)!.has(k))
                            listeners.get(state)!.set(k, new Set());
                        listeners.get(state)!.get(k)!.add(key);
                    };
                }
                const func = typeof origFuncs[key] === 'function'? origFuncs[key] : (() => origFuncs[key]) as any;
                this.funcParam[key] = typeof origFuncs[key] === 'function' && (origFuncs[key] as Function).length > 0;
                try {
                    const ret = func(prev);
                    return ret;
                } catch (err) {
                    Log.error(['game'], 'error getting value for %s on %o', key, this.tree);
                }
                finally { // end recording
                    Utils.stateAccessRecorder = undefined;
                }
            }) as any;
    
            // do initial record
            this.originalValues[key] = this.ownValues[key] = this.funcs[key]!(undefined);
            this.updateTreeValue(key);
            Events.fire(new OwnOutputEvent(this, key, this.ownValues[key], undefined));
        }
    }
    
    ownValueMayHaveChanged<Prop extends keyof Outs>(key: Prop) {
        assert((key in this.funcs) && this.funcs[key]);
        const func = this.funcs[key]! as Function;
        const oldValue = this.ownValues[key];
        const newValue = func();
        if (eq(oldValue, newValue) && !this.funcParam[key]) return;
        this.ownValues[key] = newValue;
        const debugValue = 'lEjectStartMode';
        if (key === debugValue) {
            Log.log('console', 'ownValue %s changed from %j to %j on %s', key, oldValue, newValue, this.tree.name);
        }
        Events.fire(new OwnOutputEvent(this, key, newValue, oldValue));
    }

    static getLocalTreeAffectors<Outs extends {}, Prop extends keyof Outs>(tree: Tree<Outs>, key: Prop, gPriority: number): [Tree<Outs>, number][] {
        const children = tree.children.flatMap(c => Outputs.getLocalTreeAffectors(c, key, tree.gPriority ?? gPriority));
        return [
            ...(tree.out?.funcs[key] !== undefined? [[tree, tree.gPriority ?? gPriority]] : []) as [Tree<Outs>, number][], 
            ...children,
        ];
    }

    static getTreeValues<Outs extends {}, Prop extends keyof Outs>(tree: Tree<Outs>, key: Prop): [Outs[Prop], number, Tree<Outs>][] {
        const affectors = Outputs.getLocalTreeAffectors<Outs, Prop>(tree, key, tree.gPriority ?? 0).map<[Tree<Outs>, number, number]>((x, i) => [x[0], x[1], i]);
        affectors.sort(([a, agPriority, ai], [b, bgPriority, bi]) => {
            if (agPriority !== bgPriority) return agPriority - bgPriority;
            return ai - bi;
        });
        let lastValue: Outs[Prop]|undefined = undefined;
        const results = affectors.flatMap<[Outs[Prop], number, Tree<Outs>]>(([tree, priority]) => {
            const out = tree.out!;
            const value = out.funcs[key]!(lastValue);
            if (value === undefined) return [];
            lastValue = value;
            return [[value as Outs[Prop], priority, tree]];
        });
        return results;
    }

    static computeTreeValue<Outs extends {}, Prop extends keyof Outs>(tree: Tree<Outs>, key: Prop): Outs[Prop]|undefined {
        const values = Outputs.getTreeValues(tree, key);
        return values.last()?.[0];
    }

    updateTreeValue(key: keyof Outs) {
        const oldValue = this.treeValues[key];
        this.treeValues[key] = Outputs.computeTreeValue(this.tree, key)!;
        if (eq(oldValue, this.treeValues[key])) return;
        const debugValue = 'lEjectStartMode';
        if (key === debugValue) {
            Log.log('console', 'child value %s changed from %j to %j on child of %s', key, oldValue, this.treeValues[key], this.tree.name);
        }
        Events.fire(new TreeOutputEvent(this.tree, key, this.treeValues[key], oldValue));
    }

    checkChildChange(child: Tree) {
        if (child.out)
            for (const key of Object.keys(this.ownValues) as (keyof Outs)[]) {
                if (!(key in child.out.funcs)) continue;
                this.updateTreeValue(key);
            }
        child.children.forEach(c => this.checkChildChange(c));
    }
    

    onOwnOutput<Prop extends keyof Outs>(prop: Prop, to?: any): EventTypePredicate<OwnOutputEvent<Prop>> {
        return ((e: Event) => e instanceof OwnOutputEvent && e.on === this && e.prop === prop && (to === undefined || e.value === to)) as any;
    }
    onOutputChange<Prop extends keyof Outs>(prop?: Prop, to?: any, from?: any): EventTypePredicate<OwnOutputEvent<Prop>> {
        return ((e: Event) => e instanceof TreeOutputEvent 
            && e.tree === this.tree 
            && (!prop || e.prop === prop) 
            && (to === undefined || e.value === to) 
            && (from === undefined || e.oldValue === from)
        ) as any;
    }

    cleanLog() {
        return selectiveClone(this, 'tree', 'ownValues', 'treeValues');
    }

    debugPrint() {
        for (const key of Object.keys(this.ownValues) as (keyof Outs)[]) {
            const affectors = Outputs.getTreeValues(this.tree, key).reverse();
            const baseValue = this.originalValues[key];
            const diff = affectors.filter(([v]) => !eq(v, baseValue));
            if (diff.length === 0) continue;
            const value = affectors[0]![0];
            Log.log('console', '%s set to %j by %s', key, value, 
                typeof value === 'object'? affectors.map(([v, _, tree]) => ([v, tree!.name+tree!.num]))
                : JSON.stringify(affectors.map(([v, _, tree]) => ([v, tree!.name+tree!.num]))));
        }
    }
}

export class OwnOutputEvent<OutputTypes extends {}, Prop extends keyof OutputTypes = keyof OutputTypes> extends Event {
    constructor(
        public on: Outputs<OutputTypes>, 
        public prop: Prop,
        public value?: OutputTypes[Prop],
        public oldValue?: OutputTypes[Prop],
    ) {
        super();
    }
}
export class TreeOutputEvent<OutputTypes extends {}, Prop extends keyof OutputTypes = keyof OutputTypes> extends Event {
    constructor(
        public tree: Tree<OutputTypes>, 
        public prop: Prop,
        public value: OutputTypes[Prop],
        public oldValue: OutputTypes[Prop],
    ) {
        super();
    }
}



export function toggle(opts: {
    on: () => boolean;
    off: () => boolean;
    maxOn?: number;
    initial?: boolean;
    onChange?: (state: boolean) => void;
    onOn?: (state: boolean) => void;
}): () => boolean {
    let state =  opts.initial ?? false;
    let changed = time();
    return () => {
        const oldState = state;
        if (!state) {
            if (opts.on()) {
                assert(!opts.off());
                state = true;
            }
        } else {
            if (opts.off()) {
                assert(!opts.on());
                state = false;
            }
            else if (opts.maxOn && time() - changed > opts.maxOn)
                state = false;
        }
        if (oldState !== state) {
            changed = time();
            if (opts.onChange)
                opts.onChange(state);
            if (opts.onOn && state)
                opts.onOn(state);
        }
        return state;
    };
}