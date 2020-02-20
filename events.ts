import { Time, time } from "./util";

export abstract class Event {
    constructor(
        public when = time(),
    ){
        
    }
}

export type EventPredicate = (e: Event) => boolean;
export type EventListener = ((e: Event) => void)|{[func: string]: {}}

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

    listen(l: EventListener, ...preds: EventPredicate[]) {
        this.listeners.push({
            listener: l,
            predicates: preds,
        });
    }
};


export function onType(type: any): EventPredicate {
    return e => e instanceof type;
}