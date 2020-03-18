import { ReadWrite, JSONObject } from './util';
import { Event, Events, onType, EventTypePredicate } from './events';
import { StateEvent, Tree } from './state';
import { TreeEvent } from './mode';

export type OutputTypes = {
    rampUp: boolean;
    upper3: boolean;
    num: number;
};
type OutputFuncs = {
    [key in keyof OutputTypes]?: (prev?: OutputTypes[key]) => OutputTypes[key]|undefined;
};
export type Outputs = OutputFuncs & {
    currentValues: Partial<OutputTypes>;
    owner: Tree;
};

export const outputs: Required<ReadWrite<OutputTypes>> = {
    rampUp: false,
    upper3: false,
    num: 0,
};
export let root: Tree;
export function setRoot(node: Tree) {
    node.out = {
        currentValues: outputs,
        owner: node,
    };
    root = node;
}

const defaults = Object.assign({}, outputs);

export let stateAccessRecorder: ((obj: JSONObject, key: string) => void) | undefined; 

const unrecorded = new Map<Outputs, Set<keyof Outputs>>();

export function makeOutputs(
    outs: { [P in keyof OutputTypes]?: (prev: OutputTypes[P]|undefined) => OutputTypes[P]|undefined},
    owner: Tree,
): Outputs {
    const outputs: Outputs = {
        currentValues: {} as any,
        owner,
    };
    // if (!unrecorded.has(outputs)) unrecorded.set(outputs, new Set());

    for (const key of Object.keys(outs) as (keyof OutputTypes)[]) {
        outputs[key] = ((prev: any) => {
            { // begin recording
                stateAccessRecorder = (o, k) => {
                    if (!listeners.has(o))
                        listeners.set(o, new Map());
                    if (!listeners.get(o)!.has(k))
                        listeners.get(o)!.set(k, new Map());
                    if (!listeners.get(o)!.get(k)!.has(outputs))
                        listeners.get(o)!.get(k)!.set(outputs, new Set());
                    listeners.get(o)!.get(k)!.get(outputs)!.add(key);
                };
            }
            const ret = (outs)[key]!(prev);
            { // end recording
                stateAccessRecorder = undefined;
                // unrecorded.get(outputs)!.delete(key);
            }
            return ret;
        }) as any;

        outputs.currentValues[key] = outputs[key]!(undefined) as any;

        Events.fire(new OutputEvent(outputs, key, outputs.currentValues[key]));

        // unrecorded.get(outputs)!.add(key as any);
    }
    return outputs;
}

const listeners = new Map<{}, Map<string, Map<Outputs, Set<keyof OutputTypes>>>>();

Events.listen<StateEvent<any, any>>(ev => {
    // if not recorded, then always check it
    // for (const [out, keys] of unrecorded.entries())
    //     for (const key of keys) 
    //         outputChanged(out, key);

    const l1 = listeners.get(ev.on);
    if (!l1) return;
    const l2 = l1.get(ev.prop);
    if (!l2) return;

    for (const [o, keys] of l2) {
        for (const key of keys) {
            outputChanged(o, key);
        }
    }
}, e => e instanceof StateEvent);

Events.listen<TreeEvent>(ev => {
    if (ev.after.parent && ev.after.out)
        for (const key of Object.keys(outputs)) {
            if (!(key in ev.after.out)) continue;
            recomputeBaseOutputValue(key as any);
        }
    if (ev.before.parent && ev.before.out)
        for (const key of Object.keys(outputs)) {
            if (!(key in ev.before.out)) continue;
            recomputeBaseOutputValue(key as any);
        }
}, e => e instanceof TreeEvent);

function outputChanged<Prop extends keyof OutputTypes>(out: Outputs, key: Prop) {
    if (!(key in out) || !out[key]) debugger;
    const oldValue = out.currentValues[key];
    const newValue = out[key]!() as OutputTypes[Prop];
    if (oldValue === newValue) return;
    out.currentValues[key] = newValue;
    Events.fire(new OutputEvent(out, key, newValue));
}

export function computeOutputValue<Prop extends keyof OutputTypes>(node: Tree, key: Prop, prev?: OutputTypes[Prop]): OutputTypes[Prop]|undefined {
    const func = node.out? node.out[key] : undefined;
    let value = func? func(prev as any) as OutputTypes[Prop] : undefined;
    const children = node.children.slice().sort((a, b) => (a.priority??0) - (b.priority??0));
    for (const child of children) {
        value = computeOutputValue(child, key, value);
    }
    return value;
}

export function recomputeBaseOutputValue(key: keyof OutputTypes) {
    const oldValue = outputs[key];
    (outputs[key] as any) = computeOutputValue(root, key, defaults[key])!;
    if (oldValue === outputs[key]) return;
    Events.fire(new BaseOutputEvent(key, outputs[key], oldValue));
}
Events.listen((ev: OutputEvent) => recomputeBaseOutputValue(ev.prop), (e: Event) => e instanceof OutputEvent && e.on.currentValues !== outputs);

export class OutputEvent<Prop extends keyof OutputTypes = keyof OutputTypes> extends Event {
    constructor(
        public on: Outputs, 
        public prop: Prop,
        public value?: OutputTypes[Prop],
    ) {
        super();
    }
}
export class BaseOutputEvent<Prop extends keyof OutputTypes = keyof OutputTypes> extends Event {
    constructor(
        public prop: Prop,
        public value: OutputTypes[Prop],
        public oldValue: OutputTypes[Prop],
    ) {
        super();
    }
}

export function onSubOutput<Prop extends keyof OutputTypes>(on: Tree, prop: Prop, to?: any): EventTypePredicate<OutputEvent<Prop>> {
    return ((e: Event) => e instanceof OutputEvent && e.on === on.out && e.prop === prop && (to === undefined || e.value === to)) as any;
}
export function onOutput<Prop extends keyof OutputTypes>(prop: Prop, to?: any): EventTypePredicate<OutputEvent<Prop>> {
    return ((e: Event) => e instanceof BaseOutputEvent && e.prop === prop && (to === undefined || e.value === to)) as any;
}