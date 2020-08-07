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
                    state.data[prop] = watchCollections(val);
                    Events.fire(new StateEvent(obj, prop, val, old));
                },
            });
            state.data[prop] = watchCollections(state.data[prop]);

            // initial
            Events.fire(new StateEvent(obj, prop, state.data[prop] as any, undefined as any));

            function watchCollections<T>(c: T): T {
                return watchArray(watchSet(c));
            }

            function watchArray<T>(arr: T[]|any): T[]|any {
                if (!Array.isArray(arr)) return arr;
        
                const newArr = new Proxy(arr, {
                    set: (_, key, val) => {
                        const old = arr.slice();
                        arr[key as any] = val;
                        // const num = key as number; //tryNum(key);
                        // if (num !== undefined) {
                            // const old = arr[num];
                            // if (val !== old) {
                            //     arr[num] = val;
                                Events.fire(new StateEvent(newArr, key as any, val, old), `change index ${key as number} of array ${prop}`); // `${prop}[${key}]` as any
                        Events.fire(new StateEvent(obj, prop, arr as any, old as any));
                            // }
                        // } else {
                        //     arr[key as any] = val;
                        // }
                        return true;
                    },
                    get: (_, key) => {        
                        if (Utils.stateAccessRecorder) {
                            Utils.stateAccessRecorder(obj, prop);
                        }
                        return arr[key as any];
                    },
                });
                (newArr as any).$state = new State();
                return newArr;
            }
            function watchSet<T>(set: Set<T>|any): Set<T>|any {
                if (!(set instanceof Set)) return set;
        
                const newSet = new Proxy(set, {
                    set: (_, key, val) => {
                        if (key === '$state') {
                            (set as any)[key] = val;
                            return val;
                        }
                        debugger;
                        throw new Error('unexpected');
                    },
                    get: (_, key) => {
                        if (Utils.stateAccessRecorder) {
                            Utils.stateAccessRecorder(obj, prop);
                        }
                        if (typeof (set as any)[key] !== 'function') return (set as any)[key];

                        switch (key) {
                            // case 'add':
                            //     return (val: T) => {
                            //         Events.fire(new StateEvent(newSet, 'values', null as any, null as any), `add ${val} to set ${prop}`);
                            //         return set.add(val);
                            //     };
                            // case 'clear':
                            //     return () => {
                            //         Events.fire(new StateEvent(newSet, 'values', null as any, null as any), `clear set ${prop}`);
                            //         return set.clear();
                            //     };
                            // case 'delete':
                            //     return (val: T) => {
                            //         Events.fire(new StateEvent(newSet, 'values', null as any, null as any), `delete ${val} from set ${prop}`);
                            //         return set.delete(val);
                            //     };
                            case 'delete':
                            case 'clear':
                            case 'add': {
                                return (...args: any[]) => {
                                    const old = new Set<T>(set.values());
                                    const ret = (set[key] as any)(...args);
                                    Events.fire(new StateEvent(obj, prop, set as any, old as any));
                                    Events.fire(new StateEvent(newSet, 'values', set as any, old as any));
                                    return ret;
                                };
                            }
                            case 'has':
                            case 'entries':
                            case 'forEach':
                            case 'values':
                                return Set.prototype[key].bind(set);
                            default:
                                debugger;
                                throw new Error(`unexpected key ${String(key)} in Set proxy`);
                        }
                        debugger;
                        throw new Error('unexpected');
                    },
                });
                (newSet as any).$state = new State();
                return newSet;
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