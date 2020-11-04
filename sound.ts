import { Log } from "./log";
import { MPU } from "./mpu";

let soundEnabled = false;

export async function initAudio() {
    soundEnabled = true;
    Log.log('console', 'Sound enabled');
}

export class Sound {
    // get length(): number {
    //     return this.sampleCount / this.sampleRate;
    // }
    // get sampleCount(): number {
    //     return this.buffer.length/this.channels/this.bitDepth*8;
    // }
    // constructor(
    //     public buffer: Buffer,
    //     public channels: number,
    //     public sampleRate: number,
    //     public bitDepth: number,
    // ) {

    // }
}

export interface SoundInstance {
    sound: Sound;
    ended: Promise<void>;
}

let playNum = 0;

export async function playSound(name: string, volume = 50): Promise<SoundInstance> {
    const play = ++playNum;

    if (soundEnabled)
        await MPU.sendCommand(`sound ${volume} ${name}`);
    return {
        sound: new Sound(),
        ended: new Promise(resolve => {}),
    };
}
