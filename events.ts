import { Time, time, OrArray } from "./util";

export abstract class Event {
    constructor(
        public when = time(),
    ){
        
    }
}

export type EventPredicate<E extends Event = Event> = (e: E) => boolean;
export type EventTypePredicate<E extends Event = Event> = (e: Event) => boolean;//e is E;
export type EventListener<E extends Event = Event> = ((e: E) => void)|{[func: string]: {}}

export const Events = {
    listeners: [] as {
        listener: EventListener;
        predicates: EventPredicate[];
    }[],

    fire(event: Event) {
        for (const l of this.listeners) {
            if (l.predicates.some(p => !p(event))) continue;
            if (typeof l.listener === 'object') {
                for (const funcName of Object.keys(l.listener)) {
                    const obj = l.listener[funcName] as any;
                    const func = obj[funcName] as (e: Event) => void;
                    func.apply(obj, [event]);
                }
            } else {
                l.listener(event);
            }
        }
    },

    listen<E extends Event = any>(l: EventListener<E>, typepred: OrArray<EventTypePredicate<E>>, ...preds: OrArray<EventPredicate<E>>[]) {
        this.listeners.push({
            listener: l as any,
            predicates: [typepred, ...preds].flat(),
        });
    }
};


export function onType<T extends Event>(type: any): EventTypePredicate<T> {
    return e => e instanceof type;
}