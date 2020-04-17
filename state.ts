import { Event, EventPredicate, EventTypePredicate, Events, EventListener } from './events';
import { JSONObject, NonFunctionPropertyNames, clone, Utils, FunctionPropertyNames, OrArray, arrayify, getFuncNames, isNum, tryNum, assert, getCallerLoc } from './util';
import { Outputs } from './outputs';
import { onClose } from './switch-matrix';
import { Log } from './log';
import { Tree } from './tree';

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
export function onChange<T, Prop extends keyof T>(on: T, prop?: Prop, to?: any): EventTypePredicate<StateEvent<T, Prop>> {
    if (prop) assert(State.isPropWatched(on, prop as any));
    else assert(State.hasState(on));
    return ((e: Event) => e instanceof StateEvent
        && e.on === on
        && (prop === undefined || e.prop === prop)
        && (to === undefined || e.value === to)
    ) as any;
}

export class State {
    data: JSONObject = {};

    static declare<T extends {}>(obj: T, props: ((keyof Omit<T, keyof Tree<any>>)&string)[]) {
        const state = new State();
        (obj as any).$state = state;
        for (const prop of props) {
            state.data[prop] = (obj as any)[prop];
            Object.defineProperty(obj, prop, {
                get() {
                    if (Utils.stateAccessRecorder) {
                        Utils.stateAccessRecorder(obj, prop);
                    }
                    return state.data[prop];
                },
                set(val) {
                    if (state.data[prop] === val) return;
                    const old = state.data[prop] as any;
                    state.data[prop] = watchArray(val);
                    Events.fire(new StateEvent(obj, prop, val, old));
                },
            });
            state.data[prop] = watchArray(state.data[prop]);

            // initial
            Events.fire(new StateEvent(obj, prop, state.data[prop] as any, undefined as any));

            function watchArray<T>(arr: T[]|any): T[]|any {
                if (!Array.isArray(arr)) return arr;
        
                const newArr = new Proxy(arr, {
                    set: (_, key, val) => {
                        const num = key as number; //tryNum(key);
                        // if (num !== undefined) {
                            const old = arr[num];
                            if (val !== old) {
                                arr[num] = val;
                                Events.fire(new StateEvent(newArr, key as any, val, old), `change index ${num} of array ${prop}`); // `${prop}[${key}]` as any
                            }
                        // } else {
                        //     arr[key as any] = val;
                        // }
                        return true;
                    },
                    get: (_, key) => {        
                        if (Utils.stateAccessRecorder && tryNum(key) !== undefined) {
                            Utils.stateAccessRecorder(newArr, key as any);
                        }
                        return arr[key as any];
                    },
                });
                (newArr as any).$state = new State();
                return newArr;
            }
        }
    }

    static hasState(obj: {}): boolean {
        return !!(obj as any).$state;
    }

    static isPropWatched(obj: {}, prop: string|number|symbol): boolean {
        return prop in ((obj as any).$state?.data ?? {});
    }
}