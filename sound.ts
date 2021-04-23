import { Log } from "./log";
import { MPU } from "./mpu";
import { fork } from "./promises";
import { arrayify, OrArray } from "./util";
const argv = require('yargs').argv;

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

export async function playSound(name: string, volume = 50, force = false, loops = 0): Promise<SoundInstance> {
    const play = ++playNum;

    if (soundEnabled)
        await fork(MPU.sendCommand(`sound ${volume} 1 ${force} ${loops} ${name}`));
    return {
        sound: new Sound(),
        ended: new Promise(resolve => {}),
    };
}

export async function playVoice(name: OrArray<string>, volume = 50, force = false) {
    const play = ++playNum;
    name = arrayify(name);
    name.shuffle();

    if (soundEnabled)
        await fork(MPU.sendCommand(`sound ${volume} 2 ${force} 0 ${name[0]}`));
    return {
        sound: new Sound(),
        ended: new Promise(resolve => {}),
    };
}

export async function playMusic(name: string, loops = 0, volume = 50, solo = true) {
    const play = ++playNum;

    if (argv.music === false) volume = 0;

    if (soundEnabled)
        await fork(MPU.sendCommand(`sound ${volume} 0 ${solo} ${loops} ${name}`));
    return {
        sound: new Sound(),
        ended: new Promise(resolve => {}),
    };
}

export async function stopTrack(num: number) {
    if (soundEnabled)
        await fork(MPU.sendCommand('stop-track '+num));
}

export async function stopMusic() {
    return stopTrack(0);
}
export async function stopSounds() {
    return stopTrack(1);
}

export async function muteMusic() {
    if (soundEnabled)
        await fork(MPU.sendCommand(`mute 0 true`));
}

export async function unmuteMusic() {
    if (soundEnabled)
        await fork(MPU.sendCommand(`mute 0 false`));
}