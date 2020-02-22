export function time(): Time {
    return new Date().getTime() as Time;
}

// makes a special type which acts just like T but isn't assignable to T
export type Opaque<T, Name> = T & { __opaque__: Name };
export type Time = Opaque<number, 'Time'>;

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
    if (isNaN(num)){
        if (def !== undefined) return def;
        else throw new Error(`could not parse '${input}' as number`);
    }
    return num;
}

export function nums(input: string[], ...skip: boolean[]): number[] {
    return input.map((i, index) => skip[index]? -1:num(i));
}

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [member: string]: JSONValue|undefined };
export type JSONArray = JSONValue[];

export type OrArray<T> = T|(T[]);

export interface Obj { [prop: string]: any }
export type NonFunctionPropertyNames<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K }[keyof T] &
        string;