import { Log } from './log';
import { fork } from './promises';
import { Timer } from './timer';
import { arrayify, assert, getCallerLoc, isPromise, OrArray } from './util';

export abstract class Event {
    static eventCount = 0;
    num = ++Event.eventCount;

    constructor(
        public when = Timer._getTime(),
    ) {
        
    }

    get name(): string {
        return (this as any).constructor.name;
    }

    static on(): EventTypePredicate<Event> {
        return (e: Event) => e.name === this.name;
    }
}


export class StateEvent<T, Prop extends keyof T> extends Event {//<T> extends Event {//
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

export type EventPredicate<E extends Event = Event> = (e: E) => boolean;
export type EventTypePredicate<E extends Event = Event> = (e: E) => boolean;//e is E;
export type EventCallback<E extends Event = Event> = ((e: E) => 'remove'|any)|{[func: string]: {}};
export type EventListener<E extends Event = Event> = {
    callback: EventCallback<E>;
    predicates: EventPredicate<E>[];
    cancelled?: true;
    source?: string;
    num: number;
};
let listenerCount = 0;

export const Events = {
    listeners: [] as EventListener<any>[],
    baseEvent: undefined as Event|undefined,

    holdLevel: 0,
    heldEvents: [] as [Event, string, Error][],
    hold() {
        this.holdLevel++;
    },
    release() {
        assert(this.holdLevel>0);
        this.holdLevel--;
        if (this.holdLevel === 0) {
            const held = this.heldEvents.slice();
            this.heldEvents.clear();
            for (const [e, c] of held) {
                Events.fire(e, c);
            }
        }
    },

    fire(event: Event, context = '') {
        if (this.holdLevel) {
            this.heldEvents.push([event, context, new Error()]);
            return;
        }
        if (!this.baseEvent) this.baseEvent = event;

        const listeners = this.listeners.filter(l => !l.predicates.some(p => !p(event)) && !l.cancelled);
        Log.trace([], 'fire event %s: %s %j at %i/%i listeners', event.name, context, event, listeners.length, this.listeners.length);
        for (const l of listeners) {
            if (l.cancelled) continue;
            // if (l.source) Log.trace([], 'fire for listener at %s', l.source);
            if (typeof l.callback === 'object') {
                for (const funcName of Object.keys(l.callback)) {
                    const obj = l.callback[funcName] as any;
                    const func = obj[funcName] as (e: Event) => 'remove'|any;
                    assert(func);
                    if (func.apply(obj, [event]) === 'remove') {
                        delete l.callback[funcName];
                    }
                }
                if (Object.keys(l.callback).length === 0) 
                    this.listeners.remove(l);
            } else {
                const result = l.callback(event);
                if (isPromise(result))
                    fork(result).then(r2 => {
                        if (r2 === 'remove')
                            this.listeners.remove(l);
                    });
                if (result === 'remove')
                    this.listeners.remove(l);
            }
        }

        if (this.baseEvent === event) {
            fork(this.firePriorities(), `fire priorities for event ${event.name}`);
            this.baseEvent = undefined;
        }
    },

    listen<E extends Event = any, L extends EventCallback<E> = EventCallback<E>>(
        l: L,
        typepred: OrArray<EventTypePredicate<E>>,
        ...preds: OrArray<EventPredicate<E>>[]
    ): EventListener<E> {
        const listener: EventListener<E> = {
            callback: l as any,
            predicates: [typepred, ...preds].flat(),
            source: getCallerLoc(true),
            num: ++listenerCount,
        };
        this.listeners.push(listener);
        return listener;
    },

    cancel(listener: EventListener) {
        this.listeners.remove(listener);
        listener.cancelled = true;
    },

    resetAll() {
        this.listeners.splice(0, this.listeners.length);
        this.waiting.splice(0, this.waiting.length);
        this.firing = false;
    },

    resetPriorities() {
        this.firing = false;
        this.waiting.clear();
    },

    waiting: [] as { resolve: (finish: () => void) => void; priority: Priorities; context: string }[],
    async waitPriority(priority: Priorities): Promise<() => void> {
        assert(!this.waiting.find(w => w.priority === priority));
        return new Promise(resolve => {
            this.waiting.insert(
                {resolve, priority, context: getCallerLoc(true)},
                before => before.priority > priority);
        });
    },
    async tryPriority(priority: Priorities): Promise<(() => void) | false> {
        if (this.waiting.find(w => w.priority === priority))
            return false;
        return this.waitPriority(priority);
    },

    firing: false,
    async firePriorities() {
        if (this.firing) return;
        this.firing = true;
        try {
            while (true) {
                const waiter = this.waiting[0];
                if (!waiter) return;
                await new Promise<void>(r => {
                    waiter.resolve(r);
                });
                this.waiting.remove(waiter);
            }
        } finally {
            this.firing = false;
        }
    },
};

// stuff on the top comes first
export enum Priorities {
    ReleaseMb = 1,
    EndMb,
    ShowCards,
    Mystery,
    EndBall,
    StartPoker,
    StartMb,
    Skillshot,
}

export function onType<T extends Event>(type: any): EventTypePredicate<T> {
    return e => e instanceof type;
}

export function onAny<T extends Event>(...preds: OrArray<EventPredicate<T>>[]): EventPredicate<T> {
    return e => preds.some(p => arrayify(p).every(q => q(e)));
}
