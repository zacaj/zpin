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

export function tryNum(str: any): number|undefined {
    if (typeof str === 'number') return str as number;
    const first = (str as string).charCodeAt(0);
    if (first >= 48 && first <= 57) return str as number;
    try {
        return num(str);
    } catch (e) {
        return undefined;
    }
}

export function nums(input: string[], ...skip: boolean[]): number[] {
    return input.map((i, index) => skip[index]? -1:num(i));
}

export function isNum(input: any): boolean {
    return (typeof input === 'number' && !Number.isNaN(input)) || tryNum(input) !== undefined;
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
export type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never }[keyof T] &
        string;

export type ReadWrite<T> = {
    -readonly [P in keyof T]: T[P];
};

declare global {
    interface Array<T> {
        remove(...elems: T[]): Array<T>;
        clear(): Array<T>;
        unique(): Array<T>;
        set(arr: T[]): Array<T>;
        last(): T|undefined;
        minus(...elems: T[]): Array<T>;
    }
}
Array.prototype.remove = function<T>(this: T[], ...elems: T[]): T[] {
    for (const element of elems) {
        let index: number;
        while ((index = this.indexOf(element)) !== -1) {
            this.splice(index, 1);
        }
    }
    return this;
};
Array.prototype.clear = function<T>(this: T[]): T[] {
    this.splice(0, this.length);
    return this;
};
Array.prototype.unique = function<T>(this: T[]): T[] {
    return [...new Set<T>(this)];
};
Array.prototype.set = function<T>(this: T[], that: T[]): T[] {
    this.splice(0, this.length, ...that);
    return this;
};
Array.prototype.last = function<T>(this: T[]): T|undefined {
    return this[this.length - 1];
};
Array.prototype.minus = function<T>(this: T[], ...elems: T[]): T[] {
    const arr = this.slice();
    return arr.remove(...elems);
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

export function selectiveClone<T>(obj: T, ...props: (keyof T)[]): Partial<T> {
    const c = Object.create(Object.getPrototypeOf(obj));
    for (const p of props)
        c[p] = obj[p];
    return c;
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

export function getFuncNames<T extends {}>(toCheck: T): ((keyof T)&string)[] {
    let props: string[] = [];
    let obj: any = toCheck;
    do {
        props = props.concat(Object.getOwnPropertyNames(obj).filter(e => !Object.getOwnPropertyDescriptor(obj, e)?.get));
        obj = Object.getPrototypeOf(obj);
    } while (obj);

    // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
    return props.sort().filter((e, i, arr) => 
       e !== arr[i+1] && typeof (toCheck as any)[e] === 'function',
    ) as ((keyof T)&string)[];
}

export function getCallerLoc(ignoreCurFile = false, ignorePattern?: RegExp): string {
    if (!require('./log').Log.files.trace) return '';
    const err = new Error();
    const lines = err.stack!.split('\n').slice(2);
    const imm_caller_line = lines[0];
    const file = (imm_caller_line.match(/([^/\\]+\.js)/) ?? [])[0];
    const caller_line_index = lines.findIndex(l => (!file || (ignoreCurFile && !l.includes(file))) && (!ignorePattern || !l.match(ignorePattern)));
    
    const callers = caller_line_index === -1? [imm_caller_line] : lines.slice(caller_line_index, caller_line_index+3);
    return callers.map(l => split(l, 'at')[1] || l).join(' <- ');
}
export function then<T, U = undefined>(val: Promise<T>|T, cb: (x: T) => U): Promise<U>|U {
    if ((val as any).then) return (val as Promise<T>).then(cb);
    return cb(val as T);
}

export function wrap(i: number, max: number, min = 0): number {
    if (i < 0) return wrap(max + i, max, min);
    if (i >= max) return wrap(i - max, max, min);
    return i;
}