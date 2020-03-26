import { Event, EventPredicate, EventTypePredicate, Events } from './events';
import { JSONObject, NonFunctionPropertyNames, clone, Utils, time } from './util';
import { Outputs } from './outputs';

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
export function onChange<T, Prop extends { [ K in keyof T]: K }[keyof T]>(on: T, prop: keyof T, to?: any): EventTypePredicate<StateEvent<T, Prop>> {
    return ((e: Event) => e instanceof StateEvent && e.on === on && e.prop === prop && (to === undefined || e.value === to)) as any;
}

export abstract class Tree<Outs extends {} = {}> {
    children: Tree<Partial<Outs>>[] = [];
    out?: Outputs<Outs>;
    parent?: Tree<Outs>;

    static treeCount = 0;
    num = ++Tree.treeCount;

    constructor(
        parent?: Tree<Outs>,
        public readonly priority = 0,
    ) {
        if (parent)
            parent.addChild(this);
    }

    addChild(node: Tree<Partial<Outs>>) {
        if (node.parent)
            node.parent.removeChild(node);
        const before = clone(node);
        node.parent = this;
        this.children.push(node);
        Events.fire(new TreeEvent(before, node));
    }
    removeChild(node: Tree<Partial<Outs>>) {
        if (!this.children.includes(node)) debugger;
        const before = clone(node);
        this.children.remove(node);
        node.parent = undefined;
        Events.fire(new TreeEvent(before, node));
    }

    getRoot<T extends Outs>(): Tree<Outs> {
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

    getTree<T extends Outs>() {
        return this.getRoot().getAndChildren();
    }

    isInTree(node: Tree<any>): boolean {
        // return this.getTree().includes(node);
        return this.getRoot() === node.getRoot();
    }

    hasChild(node: Tree<any>): boolean {
        return this.getChildren().includes(node);
    }

    isOrHasChild(node: Tree<any>): boolean {
        return node === this || this.getChildren().includes(node);
    }

}


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
                    state.data[prop] = val;
                    Events.fire(new StateEvent(obj, prop, val, old));
                },
            });

            // initial
            Events.fire(new StateEvent(obj, prop, state.data[prop] as any, undefined as any));
        }
    }
}


let lastTime = time();
setInterval(() => {
    const tim = time();
    Events.fire(new StateEvent(Utils, 'time', tim, lastTime));
    lastTime = tim;
}, 5);