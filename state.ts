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
export function onChange<T, Prop extends keyof T>(on: T, prop?: OrArray<Prop>, to?: any): EventTypePredicate<StateEvent<T, Prop>> {
    const props= arrayify(prop);
    if (props.length) props.forEach(prop => assert(State.isPropWatched(on, prop as any)));
    else assert(State.hasState(on));
    return ((e: Event) => e instanceof StateEvent
        && e.on === on
        && (!props.length || props.includes(e.prop))
        && (to === undefined || e.value === to)
    ) as any;
}

export class State {
    data: JSONObject = {};

    static declare<T extends {}>(obj: T, props: ((keyof Omit<T, keyof Tree<any>>)&string)[]) {
        let state = (obj as any).$state;
        if (!state) {
            state = new State();
            Object.defineProperty(obj, '$state', {
                value: state,
                enumerable: false,
            });
        }
        for (const prop of props) {
            if (prop in state.data) continue;
            state.data[prop] = (obj as any)[prop];
            const existingProperty = Object.getOwnPropertyDescriptor(obj, prop);
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
                enumerable: existingProperty?.enumerable ?? true,
            });
            state.data[prop] = watchCollections(state.data[prop]);

            // initial
            Events.fire(new StateEvent(obj, prop, state.data[prop] as any, undefined as any));

            function watchCollections<T>(c: T): T {
                return watchArray(watchSet(watchMap(c)));
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
                        if (key === 'original') return arr;
                        if (key === '$isProxy') return true;   
                        if (Utils.stateAccessRecorder) {
                            Utils.stateAccessRecorder(obj, prop);
                        }
                        return arr[key as any];
                    },
                });
                if (!Object.getOwnPropertyDescriptor(arr, '$state'))
                    Object.defineProperty(arr, '$state', {
                        value: new State(),
                        enumerable: false,
                    });
                return newArr;
            }
            function watchSet<T>(set: Set<T>|any): Set<T>|any {
                if (!(set instanceof Set)) return set;
        
                const newSet = new Proxy(set, {
                    set: (_, key, val) => {
                        debugger;
                        if (key === '$state') {
                            (set as any)[key] = val;
                            return val;
                        }
                        throw new Error('unexpected');
                    },
                    get: (_, key) => {
                        if (key === 'original') return set;
                        if (key === '$isProxy') return true;
                        if (Utils.stateAccessRecorder) {
                            Utils.stateAccessRecorder(obj, prop);
                        }
                        if (typeof (set as any)[key] !== 'function') return (set as any)[key];

                        switch (key) {
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
                            default:
                                return (Set.prototype as any)[key].bind(set);
                                debugger;
                                throw new Error(`unexpected key ${String(key)} in Set proxy`);
                        }
                        debugger;
                        throw new Error('unexpected');
                    },
                });
                if (!Object.getOwnPropertyDescriptor(set, '$state'))
                    Object.defineProperty(set, '$state', {
                        value: new State(),
                        enumerable: false,
                    });
                return newSet;
            }
            function watchMap<T, U>(map: Map<T, U>|any): Map<T, U>|any {
                if (!(map instanceof Map)) return map;
        
                const newMap = new Proxy(map, {
                    set: (_, key, val) => {
                        debugger;
                        if (key === '$state') {
                            (map as any)[key] = val;
                            return val;
                        }
                        throw new Error('unexpected');
                    },
                    get: (_, key) => {
                        if (key === 'original') return map;
                        if (key === '$isProxy') return true;
                        if (Utils.stateAccessRecorder) {
                            Utils.stateAccessRecorder(obj, prop);
                        }
                        if (typeof (map as any)[key] !== 'function') return (map as any)[key];

                        switch (key) {
                            case 'delete':
                            case 'clear':
                            case 'set': {
                                return (...args: any[]) => {
                                    const old = new Map<T, U>(map.values());
                                    const ret = (map[key] as any)(...args);
                                    Events.fire(new StateEvent(obj, prop, map as any, old as any));
                                    Events.fire(new StateEvent(newMap, 'values', map as any, old as any));
                                    return ret;
                                };
                            }
                            case 'has':
                            case 'get':
                            case 'entries':
                            case 'forEach':
                            case 'values':
                            default:
                                return (Map.prototype as any)[key].bind(map);
                                debugger;
                                throw new Error(`unexpected key ${String(key)} in Map proxy`);
                        }
                        debugger;
                        throw new Error('unexpected');
                    },
                });
                if (!Object.getOwnPropertyDescriptor(map, '$state'))
                    Object.defineProperty(map, '$state', {
                        value: new State(),
                        enumerable: false,
                    });
                return newMap;
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
