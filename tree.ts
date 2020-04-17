import { Outputs } from './outputs';
import { EventListener, Events, Event, EventTypePredicate, EventPredicate, onAny } from './events';
import { clone, assert, OrArray, arrayify, getCallerLoc, getFuncNames, FunctionPropertyNames } from './util';
import { Log } from './log';
import { State } from './state';


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
        for (const child of this.getChildren())
            child.end();
        Events.cancel(this.listener);
        this.ended = true;
        if (this.parent)
            this.parent.removeChild(this);
        Events.fire(new TreeEndEvent(this));
        return 'remove';
    }
    onEnd(): EventTypePredicate<TreeEndEvent<any>> {
        return e => e instanceof TreeEndEvent && e.tree === this;
    }
    await<T extends Event>(predicate: EventTypePredicate<T>): Promise<T> {
        return new Promise(resolve => {
            this.listen(predicate, () => {
                resolve();
                return 'remove';
            });
        });
    }

    addChild(node: Tree<Outs>, priority?: number): Tree<Outs> {
        if (node.parent)
            node.parent.removeChild(node);
        const before = clone(node);
        node.parent = this;
        this.children.push(node);
        if (priority)
            (node as any).priority = priority;
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
    watch(
        preds: OrArray<EventTypePredicate<any>>,
        func: () => any,
    ) {
        this.listen(onAny(...arrayify(preds)), func);
        func();
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
        for (const l of this.listeners.slice()) {
            if (l.predicates.some(p => !p(e))) continue;
            Log.trace([], '\tfor listener at %s', l.source ?? '?');
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

    cleanLog(): string {
        return `${this.constructor.name} #${this.num}` + 
            (State.hasState(this)? ' '+JSON.stringify((this as any).$state) : '');
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