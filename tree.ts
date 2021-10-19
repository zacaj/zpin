import { Outputs } from './outputs';
import { EventListener, Events, Event, EventTypePredicate, EventPredicate, onAny, StateEvent } from './events';
import { clone, assert, OrArray, arrayify, getCallerLoc, getFuncNames, FunctionPropertyNames, objectMap, isPromise, pushStateAccessRecorder, popStateAccessRecorder, eq } from './util';
import { Log } from './log';
import { State } from './state';
import { fork } from './promises';
import { machine } from './machine';
import { time, Timer } from './timer';

export abstract class Tree<Outs extends {} = {}> {
    tempNodes: Tree<Outs>[] = [];
    protected get nodes(): Tree<Outs>[] {
        return this.tempNodes;
    }

    private lastChildren?: Tree<Outs>[];
    get children(): Tree<Outs>[] {
        const nodes = this.nodes;
        // assert(!this.lastChildren || eq(nodes, this.lastChildren)) ;
        // {
        //     Events.fire(new TreeChangeEvent(this));
        // }
        this.lastChildren = nodes;
        return nodes;
    }



    out?: Outputs<Outs>;
    parent?: Tree<Outs>;

    static treeCount = 0;
    num = ++Tree.treeCount;

    ended = false;
    lPriority?: number;
    get allChildren() {
        return this.getAndChildren();
    }
    get allParents() {
        return this.getParents();
    }
    get aMachine() {
        return machine;
    }
    get aEvent() {
        return Events;
    }
    get aTimer() {
        return Timer;
    }

    startTime = time();

    constructor(
        public readonly gPriority?: number,
    ) {

        this.findListeners();
    }

    started() {
        Events.fire(new TreeStartEvent(this));
        for (const child of this.getChildren())
            child.started();
    }

    end(): 'remove' {
        if (this.ended) return 'remove';
        Events.fire(new TreeWillEndEvent(this));
        for (const child of this.children)
            child.end();
        this.ended = true;
        this.parent?.tempNodes.remove(this);
        Events.fire(new TreeEndEvent(this));
        return 'remove';
    }
    onEnd(): EventTypePredicate<TreeEndEvent<any>> {
        return e => e instanceof TreeEndEvent && e.tree === this;
    }
    onEnding = (e: Event) => e instanceof TreeWillEndEvent && e.tree === this;
    await<T extends Event>(predicate: OrArray<EventTypePredicate<T>>): Promise<T> {
        return new Promise(resolve => {
            this.listen(predicate, () => {
                resolve();
                return 'remove';
            });
        });
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

    addTemp(node: Tree<Outs>, priority = 0): Tree<Outs> {
        assert(!node.parent);
        if (node.gPriority)
            assert(this.getRoot().getAndChildren().filter(t => t.gPriority === node.gPriority && t !== node).length === 0);
        const before = clone(node);
        node.parent = this;
        node.lPriority = priority;
        this.tempNodes.insert(node, before => before.lPriority! > priority);
        node.started();
        return node;
    }


    listen<T extends Event>(
        pred: OrArray<EventTypePredicate<T>>,
        func: (keyof this)|((e: T) => 'remove'|any),
    ): (e: T) => 'remove'|any {
        this.listeners.push({
            callback: func as any,
            predicates: arrayify(pred) as any,
            source: getCallerLoc(true),
            num: ++listenerCount,
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
        if (this.ended) return;

        assert(!this.ended);
        // Log.trace([], 'tree fire event %s: %j', e.name, e);

        for (const child of this.children) {
            child.handleEvent(e);
        }

        for (const l of this.listeners.slice()) {
            if (l.predicates.some(p => !p(e))) continue;
            Log.trace([], '\tfor listener at %s', l.source ?? '?');
            let result: 'remove'|any;
            if (typeof l.callback === 'function') {
                result = l.callback(e);
            } else {
                result = ((this as any)[l.callback] as any)(e);
            }
            if (isPromise(result)) {
                fork(result).then(r2 => {
                    if (r2 === 'remove')
                        this.listeners.remove(l);
                });
            }
            if (result === 'remove')
                this.listeners.remove(l);
        }
    }

    private static watchNum = 0;
    watch<T extends (...args: any[]) => any>(func: T, onChange?: () => any, initialArgs: any[] = []): [T, Map<{}, Set<string>>, ReturnType<T>] {
        let num = ++Tree.watchNum;
        const stack = new Error();
        const affectors = new Map<{}, Set<string>>();
        const record = (...args: any[]) => {
            // eslint-disable-next-line no-self-assign
            num = num;
            { // begin recording
                pushStateAccessRecorder((state, k) => {
                    if (!affectors.has(state))
                        affectors.set(state, new Set());
                    if (!affectors.get(state)!.has(k))
                        affectors.get(state)!.add(k);
                });
            }
            try {
                Events.hold();
                const ret = func(...args);
                return ret;
            } catch (err) {
                Log.error(['game'], 'error evaluating watcher', err);
                Log.error(['game'], 'error from watcher:', stack.stack);
                throw err;
            }
            finally { // end recording
                popStateAccessRecorder();
                Events.release();
            }
        };

        const initialValue = record(...initialArgs);

        this.listen<StateEvent<any, any>>(ev => {
            if (!(ev instanceof StateEvent)) return false;
            const l1 = affectors.get(ev.on);
            if (!l1) return false;
            return l1.has(ev.prop);
        },
        ev => {
            if (onChange)
                onChange();
            else
                return record(ev);
        });

        return [record as any, affectors, initialValue];
    }

    cleanLog(): string {
        return `${this.constructor.name} #${this.num}` + 
            (State.hasState(this)? ' '+JSON.stringify(
                objectMap((this as any).$state, (v,k) => typeof v==='object'? k : v)) : '');
    }
    
    get name(): string {
        return (this as any).constructor.name;
    }

    makeRoot() {
        assert(!this.parent);
        
        Events.listen(e => this.handleEvent(e), () => true);
    }
}
let listenerCount = 0;
type TreeEventCallback<T extends Tree<any>> = ((e: Event) => 'remove'|any) | FunctionPropertyNames<T>;
type TreeEventListener<T extends Tree<any>> = {
    callback: TreeEventCallback<T>;
    predicates: EventPredicate[];
    source?: string;
    num: number;
};



export class TreeChangeEvent<T extends Tree<any>> extends Event {
    constructor(
        public tree: T,
    ) {
        super();
    }
}

export class TreeStartEvent<T extends Tree<any>> extends TreeChangeEvent<T> {
    constructor(
        tree: T,
    ) {
        super(tree);
    }
}

export class TreeEndEvent<T extends Tree<any>> extends TreeChangeEvent<T> {
    constructor(
        tree: T,
    ) {
        super(tree);
    }
}

export class TreeWillEndEvent<T extends Tree<any>> extends Event {
    constructor(
        public tree: T,
    ) {
        super();
    }
}