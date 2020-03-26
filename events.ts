import { time, OrArray } from './util';

export abstract class Event {
    constructor(
        public when = time(),
    ) {
        
    }
}

export type EventPredicate<E extends Event = Event> = (e: E) => boolean;
export type EventTypePredicate<E extends Event = Event> = (e: Event) => boolean;//e is E;
export type EventListener<E extends Event = Event> = ((e: E) => 'remove'|any)|{[func: string]: {}};

export const Events = {
    listeners: [] as {
        listener: EventListener;
        predicates: EventPredicate[];
    }[],

    fire(event: Event) {
        for (const l of this.listeners.slice()) {
            if (l.predicates.some(p => !p(event))) continue;
            if (typeof l.listener === 'object') {
                for (const funcName of Object.keys(l.listener)) {
                    const obj = l.listener[funcName] as any;
                    const func = obj[funcName] as (e: Event) => 'remove'|any;
                    if (func.apply(obj, [event]) === 'remove') {
                        delete l.listener[funcName];
                    }
                }
                if (Object.keys(l.listener).length === 0)
                    this.listeners.remove(l);
            } else {
                if (l.listener(event) === 'remove')
                    this.listeners.remove(l);
            }
        }
    },

    listen<E extends Event = any, L extends EventListener<E> = EventListener<E>>(
        l: L,
        typepred: OrArray<EventTypePredicate<E>>,
        ...preds: OrArray<EventPredicate<E>>[]
    ): L {
        this.listeners.push({
            listener: l as any,
            predicates: [typepred, ...preds].flat(),
        });
        return l;
    },
};


export function onType<T extends Event>(type: any): EventTypePredicate<T> {
    return e => e instanceof type;
}

