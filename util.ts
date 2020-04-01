import { time } from "./timer";


export const Utils = {
    // obj: the state object whose key was changed
    stateAccessRecorder: undefined as undefined|(<T extends {}>(obj: T, key: (keyof T)&string) => void),
};

// makes a special type which acts just like T but isn't assignable to T
export type Opaque<T, Name> = T & { __opaque__: Name };

export function split(input: string, ...on: string[]): string[] {
    let at = 0;
    const ret: string[] = [];
    for (const x of on) {
        const next = input.indexOf(x, at);
        if (next === -1) {
            break;
        }
        ret.push(input.slice(at, next));
        at = next + x.length;
    }
    if (at < input.length)
        ret.push(input.slice(at));
    return ret;
}

export function num(input: string, def?: number): number {
    const num = parseInt(input, 10);
    if (isNaN(num)) {
        if (def !== undefined) return def;
        else throw new Error(`could not parse '${input}' as number`);
    }
    return num;
}

export function tryNum(str: string): number|undefined {
    try {
        return num(str);
    } catch (e) {
        return undefined;
    }
}

export function nums(input: string[], ...skip: boolean[]): number[] {
    return input.map((i, index) => skip[index]? -1:num(i));
}

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [member: string]: JSONValue|undefined };
export type JSONArray = JSONValue[];

export type OrArray<T> = T|(T[]);
export function arrayify<T>(data: OrArray<T>): T[] {
  if (Array.isArray(data)) return data;
  else return [data];
}

export interface Obj { [prop: string]: any }
export type NonFunctionPropertyNames<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K }[keyof T] &
        string;

export type ReadWrite<T> = {
    -readonly [P in keyof T]: T[P];
};

declare global {
    interface Array<T> {
        remove(elem: T): Array<T>;
    }
}
Array.prototype.remove = function<T>(this: T[], element: T): T[] {
    let index: number;
    while ((index = this.indexOf(element)) !== -1) {
        this.splice(index, 1);
    }
    return this;
};
// polyfill flatmap for jest
if (!Array.prototype.flatMap) {
  Object.defineProperty(Array.prototype, 'flatMap', {
    value: function(callback: any, thisArg: any) {
      const self = thisArg || this;
      return self.reduce((acc: any, x: any) => acc.concat(callback(x)), []);
    },
  });
}
if (!Array.prototype.flat) {
  Object.defineProperty(Array.prototype, 'flat', {
    value: function(thisArg: any) {
      const self = thisArg || this;
      return self.reduce((acc: any, x: any) => acc.concat(x), []);
    },
  });
}

export function clone<T>(obj: T): T {
    return Object.create(
        Object.getPrototypeOf(obj), 
        Object.getOwnPropertyDescriptors(obj),
    );
}

export function assert(cond: any) {
    if (!cond) {
        debugger;
        throw new Error('assertion failed');
    }
}

export function getTypeIn<T>(obj: {}, type: any): T[] {
    const ret: T[] = [];
    for (const key of Object.keys(obj)) {
        if ((obj as any)[key] instanceof type)
            ret.push((obj as any)[key] as any);
    }
    return ret;
} 