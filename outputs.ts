import { ReadWrite, JSONObject } from './util';
import { Event, Events, onType } from './events';
import { StateEvent, Tree } from './state';

type OutputTypes = {
    rampUp: boolean;
};

export type Outputs = Readonly<Partial<OutputTypes>> & {
    currentValues: Partial<OutputTypes>;
    owner: Tree;
};

export const outputs: Required<ReadWrite<OutputTypes>> = {
    rampUp: false,
};

export let stateAccessRecorder: ((obj: JSONObject, key: string) => void) | undefined; 

const unrecorded = new Map<Outputs, Set<keyof Outputs>>();

export function makeOutputs(
    outs: { [P in keyof OutputTypes]: () => Outputs[P]},
    owner: Tree,
): Outputs {
    const outputs: Outputs = {
        currentValues: {} as any,
        owner,
    };
    // if (!unrecorded.has(outputs)) unrecorded.set(outputs, new Set());

    for (const key of Object.keys(outs) as (keyof OutputTypes)[]) {
        Object.defineProperty(outputs, key, {
            get() {
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
                const ret = (outs as any)[key]();
                { // end recording
                    stateAccessRecorder = undefined;
                    // unrecorded.get(outputs)!.delete(key);
                }
                return ret;
            },
        });

        outputs.currentValues[key] = outputs[key];

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

function outputChanged(out: Outputs, key: keyof OutputTypes) {
    const oldValue = out.currentValues[key];
    const newValue = out[key];
    if (oldValue === newValue) return;
    Events.fire(new OutputEvent(out, key, out[key]));
}

export class OutputEvent<Prop extends keyof OutputTypes> extends Event {
    constructor(
        public on: Outputs, 
        public prop: Prop,
        public value: Outputs[Prop],
    ) {
        super();
    }
}