import { OrArray, assert, arrayify, getCallerLoc } from './util';
import { time } from './timer';
import { Log } from './log';
import * as util from 'util';

export abstract class Event {
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
export type EventListener = {
    callback: EventCallback;
    predicates: EventPredicate[];
    cancelled?: true;
    source?: string;
};

export const Events = {
    listeners: [] as EventListener[],

    fire(event: Event, context = '') {
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
                if (l.callback(event) === 'remove')
                    this.listeners.remove(l);
            }
        }
    },

    listen<E extends Event = any, L extends EventCallback<E> = EventCallback<E>>(
        l: L,
        typepred: OrArray<EventTypePredicate<E>>,
        ...preds: OrArray<EventPredicate<E>>[]
    ): EventListener {
        const listener: EventListener = {
            callback: l as any,
            predicates: [typepred, ...preds].flat(),
            source: getCallerLoc(true),
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
    },
};


export function onType<T extends Event>(type: any): EventTypePredicate<T> {
    return e => e instanceof type;
}

export function onAny<T extends Event>(...preds: OrArray<EventPredicate<T>>[]): EventPredicate<T> {
    return e => preds.some(p => arrayify(p).every(q => q(e)));
}