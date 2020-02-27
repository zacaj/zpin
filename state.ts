import { Event, EventPredicate, EventTypePredicate, Events } from './events';
import { JSONObject, NonFunctionPropertyNames } from './util';
import { Outputs, stateAccessRecorder } from './outputs';

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
export function onChange<T, Prop extends { [ K in keyof T]: K }[keyof T]>(on: T, prop: keyof T, to?: any): EventTypePredicate<StateEvent<T, Prop>> {
    return ((e: Event) => e instanceof StateEvent && e.on === on && e.prop === prop && (to === undefined || e.value === to)) as any;
}

export type Tree = {
    children: Tree[];
    parent?: Tree;
    out?: Outputs;
};


export class State {
    data: JSONObject = {};

    static declare<T extends Tree>(obj: T, props: ((keyof T)&string)[]) {
        const state = new State();
        for (const prop of props) {
            state.data[prop] = (obj as any)[prop];
            Object.defineProperty(obj, prop, {
                get() {
                    if (stateAccessRecorder) {
                        stateAccessRecorder(obj, prop);
                    }
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

    static inherit<T extends {}>(obj: T, props: ((keyof T)&string)[]) {

    }
}

