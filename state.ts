import { Event, EventPredicate, EventTypePredicate, Events } from "./events";
import { JSONObject, NonFunctionPropertyNames } from "./util";

export class StateEvent<T, Prop extends { [ K in keyof T]: K }[keyof T]> extends Event {//<T> extends Event {//
    constructor(
        // public on: any, 
        // public prop: string,
        // public value: T,
        public on: T, 
        public prop: Prop,
        public value: T[Prop],
    ) {
        super();
    }
}
export function onChange<T, Prop extends { [ K in keyof T]: K }[keyof T]>
        (on: T, prop: keyof T, to?: any): EventTypePredicate<StateEvent<T, Prop>> {
    return ((e: Event) => e instanceof StateEvent && e.on === on && e.prop === prop && (to === undefined || e.value === to)) as any;
}

export interface Tree {
    children: Tree[];
}

export class State {
    data: JSONObject = {};

    static declare<T extends {}>(obj: T, props: NonFunctionPropertyNames<T>[]) {
        const state = new State();
        for (const prop of props) {
            state.data[prop] = (obj as any)[prop];
            Object.defineProperty(obj, prop, {
                get() {
                    return state.data[prop];
                },
                set(val) {
                    if (state.data[prop] === val) return;
                    state.data[prop] = val;
                    Events.fire(new StateEvent(obj, prop, val));
                },
            });
        }
    }

    static inherit<T extends JSONObject>(obj: T, props: ((keyof T)&string)[]) {
    }
}

