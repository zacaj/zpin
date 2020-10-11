import { OrArray, assert, arrayify, getCallerLoc, isPromise } from './util';
import { time } from './timer';
import { Log } from './log';
import * as util from 'util';
import { fork } from './promises';

export abstract class Event {
    static eventCount = 0;
    num = ++Event.eventCount;

    constructor(
        public when = time(),
    ) {
        
    }

    get name(): string {
        return (this as any).constructor.name;
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

    fire(event: Event, context = '') {
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
                await new Promise(r => {
                    waiter.resolve(r);
                });
                this.waiting.remove(waiter);
            }
        } finally {
            this.firing = false;
        }
    },
};

export enum Priorities {
    ShowCards = 1,
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
