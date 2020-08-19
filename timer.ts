import { Utils, Opaque, assert } from './util';
import { Events } from './events';
import { StateEvent } from './state';
import { Log } from './log';
import { fork, settleForks } from './promises';

export type Time = Opaque<number, 'Time'>;

export class Timer {
    static startTime = new Date().getTime();

    static mockTime?: number;
    static get time(): Time {
        if (Utils.stateAccessRecorder) {
            Utils.stateAccessRecorder(Timer, 'time');
        }

        if (Timer.mockTime !== undefined) return Timer.mockTime as Time;
        
        return new Date().getTime() - Timer.startTime as Time;
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
        return Timer.schedule(func, time() + ms as Time, context);
    }

    static setInterval(func: TimerCallback, ms: number, context?: string) {
        const entry = Timer.callIn(func, ms, context);
        entry.repeat = ms as Time;
        return entry;
    }

    static cancel(entry: TimerQueueEntry) {
        Timer.queue.remove(entry);
    }

    static curTime = time();

    static async fireTimers(before = time(), updateMock = false) {
        while (true) {
            const entry = Timer.queue[0];
            if (entry && entry.time <= before) {
                Timer.cancel(entry);
                try {
                    if (updateMock)
                        Timer.mockTime = entry.time;
                    await entry.func(entry);
                    await settleForks();
                } catch (err) {
                    Log.error('console', 'error running entry %o: ', entry, err);
                    debugger;
                }
                if (entry.repeat) {
                    entry.time = time() + entry.repeat as Time;
                    Timer.addToQueue(entry);
                }
            } else {
                break;
            }
        }
        
        if (updateMock)
            Timer.mockTime = before;
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
    fork(Timer.fireTimers(tim), 'timer tick');
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
    const newTime = time();
    if (ms === undefined && lastTime) {
        Timer.startTime -= lastTime - newTime;
        const newNewTime = time();
        assert(Math.abs(newNewTime - lastTime) < 2);
        Log.log('console', 'adjusted time to %i', newNewTime);
    }
    await Timer.fireTimers(newTime, !!ms);
    Events.fire(new StateEvent(Timer, 'time', ms as Time ?? time(), lastTime as Time));
    if (Timer.mockTime !== undefined)
        await settleForks();
}
export async function passTime(ms = 1) {
    assert(Timer.mockTime !== undefined);
    await setTime(Timer.mockTime! + ms);
}

export async function wait(ms: number, context?: string) {
    return new Promise(resolve => safeSetTimeout(resolve, ms, context ?? 'wait '+ms));
}