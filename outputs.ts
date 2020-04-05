import { Event, Events, onType, EventTypePredicate } from './events';
import { StateEvent, Tree, TreeEvent } from './state';
import { Utils } from './util';
import { time } from './timer';

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
    defaults!: Partial<Outs>;
    funcs!: OutputFuncs<Outs>;

    // state -> stateKey -> our key that listens to it
    listeners = new Map<{}, Map<string, Set<keyof Outs>>>();

    constructor(
        public readonly tree: Tree<Outs>,
        origFuncs: OutputFuncsOrValues<Outs>,
    ) {
        this.defaults = {} as any;
        this.funcs = {} as any;
        this.ownValues = {} as any;
        this.treeValues = {} as any;
        tree.out = this;

        Events.listen<StateEvent<any, any>>(ev => {
            // if not recorded, then always check it
            // for (const [out, keys] of unrecorded.entries())
            //     for (const key of keys) 
            //         outputChanged(out, key);

            const l1 = this.listeners.get(ev.on); // keys on state we listen to
            if (!l1) return;
            const outs = l1.get(ev.prop); // which of our funcs listen
            if (!outs) return;

            for (const key of outs) {
                this.ownValueMayHaveChanged(key);
            }
        }, e => e instanceof StateEvent);

        // catch child tree structure changes
        Events.listen<TreeEvent<any>>(ev => {
            if (ev.after.parent)
                this.checkChildChange(ev.after);
            if (ev.before.parent)
                this.checkChildChange(ev.before);
        }, e => e instanceof TreeEvent && (this.tree.hasChild(e.before) || this.tree.hasChild(e.after)));

        // catch child tree value changes
        Events.listen((ev: OwnOutputEvent<Outs>) => this.updateTreeValue(ev.prop),
            (e: Event) => e instanceof OwnOutputEvent && this.tree.isOrHasChild(e.on.tree));

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
                const ret = func(prev);
                { // end recording
                    Utils.stateAccessRecorder = undefined;
                    // unrecorded.get(outputs)!.delete(key);
                }
                return ret;
            }) as any;
    
            // do initial record
            this.defaults[key] = this.ownValues[key] = this.funcs[key]!(undefined);
            Events.fire(new OwnOutputEvent(this, key, this.ownValues[key], undefined));
    
            // unrecorded.get(outputs)!.add(key as any);
        }
    }

   /* ownValueMayHaveChanged<Prop extends keyof Outs>(key: Prop) {
        if (!(key in this.funcs) || !this.funcs[key]) debugger;
        const oldValue = this.ownValues[key];
        const newValue = this.funcs[key]!();
        if (oldValue === newValue) return;
        this.ownValues[key] = newValue;
        Events.fire(new OwnOutputEvent(this, key, newValue, oldValue));
    }*/
    
    ownValueMayHaveChanged<Prop extends keyof Outs>(key: Prop) {
        if (!(key in this.funcs) || !this.funcs[key]) debugger;
        const func = this.funcs[key]! as Function;
        const oldValue = this.ownValues[key];
        const newValue = func();
        if (oldValue === newValue && !func.length) return;
        this.ownValues[key] = newValue;
        Events.fire(new OwnOutputEvent(this, key, newValue, oldValue));
    }

    static computeTreeValue<Outs extends {}, Prop extends keyof Outs>(tree: Tree<Outs>, key: Prop, prev?: Outs[Prop]): Outs[Prop]|undefined {
        let value = tree.out?.funcs[key]? tree.out.funcs[key]!(prev): (tree.out?.defaults[key] ?? prev);
        const children = tree.children.slice().sort((a, b) => (a.priority??0) - (b.priority??0));
        for (const child of children) {
            value = Outputs.computeTreeValue(child, key, value)!;
        }
        return value;
    }

    updateTreeValue(key: keyof Outs) {
        const oldValue = this.treeValues[key];
        this.treeValues[key] = Outputs.computeTreeValue(this.tree, key, this.defaults[key])!;
        if (oldValue === this.treeValues[key]) return;
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
            if (opts.on())
                state = true;
        } else {
            if (opts.off())
                state = false;
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