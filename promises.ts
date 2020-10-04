import { Log } from './log';
import { compareHands } from './modes/poker';
import { eq, getCallerLoc } from './util';
import { Timer } from './timer';

export class FakePromise<T = any> implements Promise<T> {
    ended = false;
    constructor(
        public promise: Promise<T>,
        public name: string,
        public level: number,
    )
     {
        forks.add(this);
         // eslint-disable-next-line @typescript-eslint/no-floating-promises
        promise.finally(() => {
            forks.delete(this);
            this.ended = true;
        });
     }
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null): FakePromise<TResult1 | TResult2> {
        return new FakePromise(this.promise.then(onfulfilled), this.name, this.level+1);
    }
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): FakePromise<T | TResult> {
        return new FakePromise(this.promise.catch(onrejected), this.name, this.level+1);
    }
    finally(onfinally?: (() => void) | undefined | null): FakePromise<T> {
        return new FakePromise(this.promise.finally(onfinally), this.name, this.level+1);
    }
    readonly [Symbol.toStringTag]: string;
}

export const forks = new Set<FakePromise<any>>();
export function fork<T>(promise?: Promise<T>|void|any, name?: string): FakePromise<T> {
    if (!promise || !('then' in promise)) return null as any;
    if (promise instanceof FakePromise) return promise;
    if (!name) name = getCallerLoc(true);
    const e = new Error();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    promise.catch((err: any) => {
        Log.error('console', 'fork %s errored: ', name, err);
        Log.error('console', 'fork source stack: ', e.stack);
    });

    return new FakePromise(promise, name, 0);
}

export async function settleForks() {
    if (Timer.mockTime === undefined) return;
    let times = 0;
    let settlesLeft = 2;
    while (true) {
        const oldForks = [...forks];
        await new Promise(r => r());
        const newForks = [...forks];
        if (eq(oldForks, newForks)) {
            if (!settlesLeft--) 
                break;
        }
        times++;

        if (times%10 === 0) {
            Log.info('console', 'NOTE: waiting for forks to settle, #%i', times);
        }
    }
}