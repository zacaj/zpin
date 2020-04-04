import { OrArray, assert, arrayify } from './util';
import { time } from './timer';

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
export type EventTypePredicate<E extends Event = Event> = (e: Event) => boolean;//e is E;
export type EventCallback<E extends Event = Event> = ((e: E) => 'remove'|any)|{[func: string]: {}};

export const Events = {
    listeners: [] as {
        listener: EventCallback;
        predicates: EventPredicate[];
    }[],

    fire(event: Event) {
        for (const l of this.listeners.slice()) {
            if (l.predicates.some(p => !p(event))) continue;
            if (typeof l.listener === 'object') {
                for (const funcName of Object.keys(l.listener)) {
                    const obj = l.listener[funcName] as any;
                    const func = obj[funcName] as (e: Event) => 'remove'|any;
                    assert(func);
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

    listen<E extends Event = any, L extends EventCallback<E> = EventCallback<E>>(
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

    resetAll() {
        this.listeners.splice(0, this.listeners.length);
    },
};


export function onType<T extends Event>(type: any): EventTypePredicate<T> {
    return e => e instanceof type;
}

export function onAny<T extends Event>(...preds: OrArray<EventPredicate>[]): EventPredicate {
    return e => preds.some(p => arrayify(p).every(q => q(e)));
}