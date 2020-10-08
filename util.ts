
const stateAccessRecorders: (<T extends {}>(obj: T, key: (keyof T)&string) => void)[] = [];
export function pushStateAccessRecorder(cb: <T extends {}>(obj: T, key: (keyof T)&string) => void) {
    stateAccessRecorders.push(cb);
}
export function popStateAccessRecorder() {
    stateAccessRecorders.pop();
}

export function recordStateAccess<T extends {}>(obj: T, key: (keyof T)&string) {
    stateAccessRecorders.forEach(cb => cb(obj, key));
}


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
export function arrayify<T>(data?: OrArray<T>): T[] {
    if (!data) return [];
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
        oxford(last: string): string;
        nonOxford(last: string): string;
        insert(value: T, where: (before: T) => boolean): number;
        shuffle(rand?: () => number, times?: number): this;
        sum(conv?: (val: T, index: number) => number): number;
        rotate(amount: number): this;
        truthy(): Array<NonNullable<T>>;
    }

    interface String {
        and<T extends {}>(obj: T): string&T;
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
Array.prototype.oxford = function<T>(this: T[], last: string): string {
    let str = this.slice(0, this.length-1).join(', ');
    if (this.length > 2) str += ',';
    if (this.length > 1) str += ' '+last+' ';
    return str+this.last();
};
Array.prototype.nonOxford = function<T>(this: T[], last: string): string {
    let str = this.slice(0, this.length-1).join(', ');
    if (this.length > 1) str += ' '+last+' ';
    return str+this.last();
};
Array.prototype.insert = function<T>(this: T[], value: T, where: (before: T) => boolean): number {
    let pos = this.length;
    for (let i=0; i<this.length; i++) {
        if (where(this[i])) {
            pos = i;
            break;
        }
    }
    this.splice(pos, 0, value);
    return pos;
};
Array.prototype.shuffle = function<T>(this: T[], rand: () => number = () => Math.random(), times = 3): T[] {
    for (let k=0; k<times; k++) {
        for (let i = this.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [this[i], this[j]] = [this[j], this[i]];
        }
    }
    return this;
};
Array.prototype.sum = function<T>(this: T[], conv?: (val: T, index: number) => number): number {
    return this.reduce((prev, cur, index) => prev + (conv? conv(cur, index) : cur as any), 0);
};
Array.prototype.rotate = function<T>(this: T[], amount: number): T[] {
    while (amount > 0) {
        this.unshift(this.pop()!);
        amount--;
    }
    while (amount < 0) {
        this.push(this.shift()!);
        amount++;
    }
    return this;
};
Array.prototype.truthy = function<T>(this: T[]): NonNullable<T>[] {
    return this.filter(x => !!x) as any;
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


export function and<S extends string, O extends {}>(_str: S, obj: O): S&O {
    const str: any = _str;
    objectMap(obj, (val, key) => {
        str[key] = val;
    });
    return str;
}

String.prototype.and = function<T extends {}>(this: string, obj: T): T&string {
    return and(this, obj);
};

export function clone<T>(obj: T): T {
    return Object.create(
        Object.getPrototypeOf(obj), 
        objectMap(Object.getOwnPropertyDescriptors(obj), (d, k) => ({
            value: 'value' in d? d.value : (obj as any)[k],
            configurable: d.configurable,
            enumerable: d.enumerable,
            writable: 'writable' in d? d.writable : 'get' in d,
        })),
    );
}

export function seq<T = number>(count: number): T[] {
    const ret: T[] = [];
    for (let i=0; i<count; i++)
        ret.push(i as any);
    return ret;
}

export function range<T = number>(start: number, end: number): T[] {
    const ret: T[] = [];
    for (let i=start; i<=end; i++)
        ret.push(i as any);
    return ret;
}

export function repeat<T>(x: T, count: number): T[] {
    const ret: T[] = [];
    for (let i=0; i<count; i++)
        ret.push(x);
    return ret;
}

export function selectiveClone<T>(obj: T, ...props: (keyof T)[]): Partial<T> {
    const c = Object.create(Object.getPrototypeOf(obj));
    for (const p of props)
        c[p] = obj[p];
    return c;
}

export function assert(cond: any, message = 'assertion failed') {
    if (!cond) {
        let throwError = false;
        throwError = !debugging();
        debugger;
        if (throwError) throw new Error(message);
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

export function getPropertyDescriptor<O extends {}>(o: O|undefined, key: keyof O): PropertyDescriptor|undefined {
    if (!o) return undefined;
    const own = Object.getOwnPropertyDescriptor(o, key);
    if (own) return own;
    return getPropertyDescriptor(Object.getPrototypeOf(o), key);
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

export function eq<T>(a: T, b: T): boolean {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v,i) => eq(v, b[i]));
    }

    return a === b;
}

interface Dictionary<T> {
    [key: string]: T;
}

export function objectMap<TValue, TResult>(
    obj: Dictionary<TValue>,
    valSelector: (val: TValue, key: string) => TResult,
    keySelector?: (key: string, obj: Dictionary<TValue>) => string,
    ctx?: Dictionary<TValue>,
) {
    const ret = {} as Dictionary<TResult>;
    for (const key of Object.keys(obj)) {
        const retKey = keySelector
            ? keySelector.call(ctx ?? null, key, obj)
            : key;
        const retVal = valSelector.call(ctx ?? null, obj[key], key);
        ret[retKey] = retVal;
    }
    return ret;
}

export function isPromise(promise?: any): boolean {
    return !!promise?.then;
}

const inspector = require('inspector');
export function debugging(): boolean {
    const argv = process.execArgv.join();
    const isDebug = argv.includes('inspect') || argv.includes('debug') || !!inspector.url();
    return isDebug;
}

export function comma(value: number, minWidth = 0): string {
    const s = Math.abs(value).toFixed();
    const commad = (value<0? '-':'')+Array.from({length: Math.ceil(s.length/3)}, (_, i) => s.substr(i*3-(i===0?0:3-(s.length%3||3)), i===0? s.length%3||3 : 3)).join(',')
    return commad.padStart(minWidth, ' ');
}

export function money(value: number, minWidth = 0, plus = ''): string {
    const s = comma(value, 0);
    return ((s.startsWith('-')? '-':plus)+'$'+(s.startsWith('-')? s.slice(1):s)).padStart(minWidth, ' ');
}

export function score(value: number, minWidth = 0): string {
    return comma(value, minWidth).trim().padStart(2, '0').padStart(minWidth, ' ');
}

export function short(number: number, minWidth = 0): string {
    const SI_PREFIXES = [
        { value: 1, symbol: '' },
        { value: 1e3, symbol: 'k' },
        { value: 1e6, symbol: 'M' },
        { value: 1e9, symbol: 'G' },
        { value: 1e12, symbol: 'T' },
        { value: 1e15, symbol: 'P' },
        { value: 1e18, symbol: 'E' },
        
    ].reverse();

    if (number === 0) return '00';

    const tier = SI_PREFIXES.find((n) => number >= n.value)!;
    let numberFixed = (number / tier.value).toFixed(1);
    if (numberFixed.endsWith('.0'))
        numberFixed = numberFixed.slice(0, numberFixed.length-2);

    return `${numberFixed}${tier.symbol}`.padStart(minWidth, ' ');
}

export function makeState<Name extends string, T extends {}, Args extends any[] = []>(name: Name, obj: T|((...args: Args) => T)): 
(...args: Args) => {
    [N in Name]: true;
} & {
    _: Name;
} & T {
    return  (...args: Args) => Object.assign({_: name, [name]: true}, typeof obj === 'object'? obj : (obj as any)(...args)) as any;
}

// type StateType<S extends []> = {};
// type StateType<S extends [() => {_: string}] = ReturnType<S[0]>;

// type States<State extends {_: string}> = 
// function initState<Name extends string, Args extends (() => {_: Name})>(...states: Args[]): ReturnType<Args>&{[name in Name]: undefined} {
//     return states[0]() as any;
// }