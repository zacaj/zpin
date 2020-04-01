import { Utils, Opaque, assert } from './util';
import { Events } from './events';
import { StateEvent } from './state';
import { Log } from './log';

export type Time = Opaque<number, 'Time'>;

export class Timer {

    static mockTime?: number;
    static get time(): Time {
        if (Utils.stateAccessRecorder) {
            Utils.stateAccessRecorder(Timer, 'time');
        }

        if (Timer.mockTime) return Timer.mockTime as Time;
        
        return new Date().getTime() as Time;
    }

    static queue: TimerQueueEntry[] = [];

    private static addToQueue(entry: TimerQueueEntry) {
        let i = 0;
        for (; i<Timer.queue.length; i++) {
            if (Timer.queue[i].time >= entry.time) {
                break;
            }
        }
        
        Timer.queue.splice(i, 0, entry);
    }

    static schedule(func: TimerCallback, at: Time, context?: string): TimerQueueEntry {
        const entry = { func, time: at, context };
        Timer.addToQueue(entry);
        return entry;
    }

    static callIn(func: TimerCallback, ms: number, context?: string) {
        return Timer.schedule(func, time() + ms as Time);
    }

    static setInterval(func: TimerCallback, ms: number, context?: string) {
        const entry = Timer.callIn(func, ms);
        entry.repeat = ms as Time;
        return entry;
    }

    static cancel(entry: TimerQueueEntry) {
        Timer.queue.remove(entry);
    }

    static curTime = time();

    static async fireTimers(before = time()) {
        for (const entry of Timer.queue.slice()) {
            if (entry.time <= before) {
                Timer.cancel(entry);
                try {
                    await entry.func(entry);
                } catch (err) {
                    Log.error('console', 'error running entry %o: ', entry, err);
                }
                if (entry.repeat) {
                    entry.time = time() + entry.repeat as Time;
                    Timer.addToQueue(entry);
                }
            }
        }
    }

    static reset() {
        this.queue = [];
    }
}
setInterval(() => {
    if (Timer.mockTime) return;
    const tim = time();
    Events.fire(new StateEvent(Timer, 'time', tim, Timer.curTime));
    Timer.curTime = tim;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    Timer.fireTimers(tim);
}, 5);

export type TimerCallback = (entry: TimerQueueEntry) => Promise<any>|any;
export type TimerQueueEntry = {
    time: Time;
    func: TimerCallback;
    repeat?: Time;
    context?: string;
};

export function safeSetInterval(func: () => any, ms: number, context: string) {
    // setInterval(() => {
    //     if (Timer.mockTime) return 'skipped';
    //     return func();
    // }, ms);
    Timer.setInterval(func, ms, context);
}
export function safeSetTimeout(func: () => any, ms: number, context: string) {
    // assert(!Timer.mockTime);
    // setTimeout(func, ms);
    Timer.callIn(func, ms, context);
}
export function time() {
    return Timer.time;
}
export async function setTime(ms?: number) {
    const lastTime = Timer.mockTime;
    Timer.mockTime = ms;
    await Timer.fireTimers(time());
    Events.fire(new StateEvent(Timer, 'time', ms as Time ?? time(), lastTime as Time));
}
export async function passTime(ms = 1) {
    assert(!!Timer.mockTime);
    await setTime(Timer.mockTime! + ms);
}

export async function wait(ms: number, context?: string) {
    return new Promise(resolve => safeSetTimeout(resolve, ms, context ?? 'wait '+ms));
}