import { Outputs } from './outputs';
import { EventListener, Events, Event, EventTypePredicate, EventPredicate, onAny } from './events';
import { clone, assert, OrArray, arrayify, getCallerLoc, getFuncNames, FunctionPropertyNames, objectMap, isPromise, pushStateAccessRecorder, popStateAccessRecorder } from './util';
import { Log } from './log';
import { State, StateEvent } from './state';
import { fork } from './promises';
import { machine } from './machine';
import { Timer } from './timer';


export abstract class Tree<Outs extends {} = {}> {
    children: Tree<Outs>[] = [];
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

    constructor(
        public readonly gPriority?: number,
        parent?: Tree<Outs>,
        lPriority?: number,
    ) {
        if (parent)
            parent.addChild(this, lPriority);

        this.findListeners();
    }

    end(): 'remove' {
        Events.fire(new TreeWillEndEvent(this));
        for (const child of this.getChildren())
            child.end();
        if (this.parent)
            this.parent.removeChild(this);
	    this.ended = true;
        Events.fire(new TreeEndEvent(this));
        return 'remove';
    }
    onEnd(): EventTypePredicate<TreeEndEvent<any>> {
        return e => e instanceof TreeEndEvent && e.tree === this;
    }
    onEnding = (e: Event) => e instanceof TreeWillEndEvent && e.tree === this;
    await<T extends Event>(predicate: EventTypePredicate<T>): Promise<T> {
        return new Promise(resolve => {
            this.listen(predicate, () => {
                resolve();
                return 'remove';
            });
        });
    }

    addChild(node: Tree<Outs>, priority = 0): Tree<Outs> {
        if (node.parent)
            node.parent.removeChild(node);
        if (node.gPriority)
            assert(this.getRoot().getAndChildren().filter(t => t.gPriority === node.gPriority && t !== node).length === 0);
        const before = clone(node);
        node.parent = this;
        node.lPriority = priority;
        this.children.insert(node, before => before.lPriority! > priority);
        Events.fire(new TreeEvent(before, node));
        return node;
    }
    removeChild(node: Tree<Outs>) {
        assert(this.children.includes(node));
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
            source: getCallerLoc(true),
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

    watch<T extends (...args: any[]) => any>(func: T, onChange?: () => any, initialArgs: any[] = []): [T, Map<{}, Set<string>>, ReturnType<T>] {
        const stack = new Error();
        const affectors = new Map<{}, Set<string>>();
        const record = (...args: any[]) => {
            { // begin recording
                pushStateAccessRecorder((state, k) => {
                    if (!affectors.has(state))
                        affectors.set(state, new Set());
                    if (!affectors.get(state)!.has(k))
                        affectors.get(state)!.add(k);
                });
            }
            try {
                const ret = func(...args);
                return ret;
            } catch (err) {
                Log.error(['game'], 'error evaluating watcher', err);
                Log.error(['game'], 'error from watcher:', stack.stack);
                throw err;
            }
            finally { // end recording
                popStateAccessRecorder();
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
                record();
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
type TreeEventCallback<T extends Tree<any>> = ((e: Event) => 'remove'|any) | FunctionPropertyNames<T>;
type TreeEventListener<T extends Tree<any>> = {
    callback: TreeEventCallback<T>;
    predicates: EventPredicate[];
    source?: string;
};


export class TreeEvent<T> extends Event {
    constructor(
        public before: Tree<T>,
        public after: Tree<T>,
    ) {
        super();
    }
}

export class TreeEndEvent<T extends Tree<any>> extends Event {
    constructor(
        public tree: T,
    ) {
        super();
    }
}

export class TreeWillEndEvent<T extends Tree<any>> extends Event {
    constructor(
        public tree: T,
    ) {
        super();
    }
}