import { Event, EventPredicate, EventTypePredicate, Events, EventListener } from './events';
import { JSONObject, NonFunctionPropertyNames, clone, Utils, FunctionPropertyNames, OrArray, arrayify, getFuncNames, isNum, tryNum, assert } from './util';
import { Outputs } from './outputs';
import { onClose } from './switch-matrix';

export class StateEvent<T, Prop extends { [ K in keyof T]: K }[keyof T]> extends Event {//<T> extends Event {//
    constructor(
        // public on: any, 
        // public prop: string,
        // public value: T,
        public on: T, 
        public prop: Prop,
        public value: T[Prop],
        public oldValue: T[Prop],
    ) {
        super();
    }
}
export function onChange<T, Prop extends { [ K in keyof T]: K }[keyof T]>(on: T, prop?: keyof T, to?: any): EventTypePredicate<StateEvent<T, Prop>> {
    if (prop) assert(State.isPropWatched(on, prop as any));
    else assert(State.hasState(on));
    return ((e: Event) => e instanceof StateEvent
        && e.on === on
        && (prop === undefined || e.prop === prop)
        && (to === undefined || e.value === to)
    ) as any;
}

export abstract class Tree<Outs extends {} = {}> {
    children: Tree<Outs>[] = [];
    out?: Outputs<Outs>;
    parent?: Tree<Outs>;

    static treeCount = 0;
    num = ++Tree.treeCount;

    ended = false;
    listener!: EventListener;

    constructor(
        parent?: Tree<Outs>,
        public readonly priority = 0,
    ) {
        if (parent)
            parent.addChild(this);

        this.findListeners();

        this.listener = Events.listen(e => this.handleEvent(e), () => true);
    }

    end(): 'remove' {
        Events.cancel(this.listener);
        this.ended = true;
        if (this.parent)
            this.parent.removeChild(this);
        return 'remove';
    }

    addChild(node: Tree<Outs>) {
        if (node.parent)
            node.parent.removeChild(node);
        const before = clone(node);
        node.parent = this;
        this.children.push(node);
        Events.fire(new TreeEvent(before, node));
    }
    removeChild(node: Tree<Outs>) {
        if (!this.children.includes(node)) debugger;
        const before = clone(node);
        this.children.remove(node);
        node.parent = undefined;
        Events.fire(new TreeEvent(before, node));
    }

    getRoot(): Tree<Outs> {
        if (this.parent)
            return this.parent.getRoot();
        else
            return this;
    }

    getParents(): Tree<Outs>[] {
        if (!this.parent) return [];
        return [this.parent, ...this.parent.getParents()];
    }

    getChildren() {
        return this.children.flatMap(c => c.getAndChildren());
    }

    getAndChildren(): this['children'] {
        return [this, ...this.getChildren()];
    }

    getTree() {
        return this.getRoot().getAndChildren();
    }

    isInTree(node: Tree<Outs>): boolean {
        // return this.getTree().includes(node);
        return this.getRoot() === node.getRoot();
    }

    hasChild(node: Tree<Outs>): boolean {
        return this.getChildren().includes(node);
    }

    isOrHasChild(node: Tree<Outs>): boolean {
        return node === this || this.getChildren().includes(node);
    }
    hasParent(node: Tree<Outs>): boolean {
        return this.getParents().includes(node);
    }




    listen<T extends Event>(
        pred: OrArray<EventTypePredicate<T>>,
        func: (keyof this)|((e: T) => 'remove'|any),
    ): (e: T) => 'remove'|any {
        this.listeners.push({
            callback: func as any,
            predicates: arrayify(pred) as any,
        });
        if (typeof func === 'function') 
            return func;
        else 
            return this[func] as any;
    }
    private findListeners() {
        for (const key of getFuncNames(this)) {
            const prop = this[key];
            if (prop instanceof Function && key.startsWith('on')) {
                const types = key.slice(2).split('Or');
                this.listen(e => types.includes(e.name.replace(/Event$/, '')), key);
            }
        }
    }

    listeners: TreeEventListener<any>[] = [];
    handleEvent(e: Event) {
        assert(!this.ended);
        for (const l of this.listeners.slice()) {
            if (l.predicates.some(p => !p(e))) continue;
            let result: 'remove'|any;
            if (typeof l.callback === 'function') {
                result = l.callback(e);
            } else {
                result = ((this as any)[l.callback] as any)(e);
            }
            if (result === 'remove')
                this.listeners.remove(l);
        }
    }
}
type TreeEventCallback<T extends Tree<any>> = ((e: Event) => 'remove'|any) | FunctionPropertyNames<T>;
type TreeEventListener<T extends Tree<any>> = {
    callback: TreeEventCallback<T>;
    predicates: EventPredicate[];
};


export class TreeEvent<T> extends Event {
    constructor(
        public before: Tree<T>,
        public after: Tree<T>,
    ) {
        super();
    }
}


export class State {
    data: JSONObject = {};

    static declare<T extends {}>(obj: T, props: ((keyof Omit<T, keyof Tree<any>>)&string)[]) {
        const state = new State();
        (obj as any).$state = state;
        for (const prop of props) {
            state.data[prop] = (obj as any)[prop];
            Object.defineProperty(obj, prop, {
                get() {
                    if (Utils.stateAccessRecorder) {
                        Utils.stateAccessRecorder(obj, prop);
                    }
                    return state.data[prop];
                },
                set(val) {
                    if (state.data[prop] === val) return;
                    const old = state.data[prop] as any;
                    state.data[prop] = watchArray(val);
                    Events.fire(new StateEvent(obj, prop, val, old));
                },
            });
            state.data[prop] = watchArray(state.data[prop]);

            // initial
            Events.fire(new StateEvent(obj, prop, state.data[prop] as any, undefined as any));

            function watchArray<T>(arr: T[]|any): T[]|any {
                if (!Array.isArray(arr)) return arr;
        
                const newArr = new Proxy(arr, {
                    set: (_, key, val) => {
                        const num = tryNum(key);
                        if (num !== undefined) {
                            const old = arr[num];
                            if (val !== old) {
                                arr[num] = val;
                                Events.fire(new StateEvent(newArr, key as any, val, old)); // `${prop}[${key}]` as any
                            }
                        } else {
                            arr[key as any] = val;
                        }
                        return true;
                    },
                    get: (_, key) => {        
                        if (Utils.stateAccessRecorder && tryNum(key) !== undefined) {
                            Utils.stateAccessRecorder(newArr, key as any);
                        }
                        return arr[key as any];
                    },
                });
                (newArr as any).$state = new State();
                return newArr;
            }
        }
    }

    static hasState(obj: {}): boolean {
        return !!(obj as any).$state;
    }

    static isPropWatched(obj: {}, prop: string|number|symbol): boolean {
        return prop in ((obj as any).$state?.data ?? {});
    }
}