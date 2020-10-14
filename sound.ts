// const Speaker = require('speaker');
// import { Mixer } from 'audio-mixer';
// import * as fs from 'fs';
// import { promisify } from 'util';
// import * as Path from 'path';
// import { Log } from './log';
// const wav = require('node-wav');

import { MPU } from "./mpu";

// let mixer: Mixer;

// const sounds: { [name: string]: Sound[]} = {};

export async function initAudio() {
//     mixer = new Mixer({
//         channels: 2,
//         sampleRate: 44100,
//         bitDepth: 16,
//     });
//     mixer.pipe(new Speaker({
//         channels: 2,
//         sampleRate: 44100,
//         bitDepth: 16,
//     }));
//     Log.log('gfx', 'precaching sounds...');
//     await Promise.all(fs.readdirSync('./media').map(async file => {
//         if (!file.endsWith('.wav')) return;

//         const sound = await getSound(file);

//         const [name, num] = file.split('.')[0].split('_');
//         if (!sounds[name])
//             sounds[name] = [];
//         sounds[name].push(sound);
//     }));
//     Log.log('gfx', 'sounds precached');
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

    await MPU.sendCommand(`sound ${volume} ${name}`);
    return {
        sound: new Sound(),
        ended: new Promise(resolve => {}),
    };

//     if (!mixer) return null as any;
//     Log.info('sound', 'req  %s %i', name, play);
//     const sound = name in sounds? sounds[name][0] : await getSound(name);
//     Log.info('sound', 'got  %s %i', name, play);
//     console.time('play'+play);
//     const input = mixer.input({
//         sampleRate: sound.sampleRate,
//         channels: sound.channels,
//         bitDepth: sound.bitDepth,
//     });
//     Log.info('sound', 'made %s %i', name, play);
//     input.setVolume(volume);
//     input.write(sound.buffer, () =>  {});
//     input.write(sound.buffer, () =>  {console.timeEnd('play'+play);
//     Log.info('sound', 'write %s %i', name, play);});
//     let done: any;
//     const instance: SoundInstance = {
//         sound,
//         ended: new Promise(resolve => done = resolve),
//     };
//     setTimeout(() => {
//         mixer.removeInput(input);
//         done();
//         Log.info('sound', 'done %s %i', name, play);
//     }, sound.length*3000);
//     return instance;
}

// const fileCache = new Map<string, Sound>(); // raw filename
// async function getSound(file: string) {
//     if (!fileCache.has(file)) {
//         console.time(file);
//         const buffer = await promisify(fs.readFile)(Path.isAbsolute(file)? file : Path.join('media', file));
//         const result = wav.decode(buffer);
//         result.buffer = f32tos16(result.channelData);
//         console.timeEnd(file);
//         fileCache.set(file, new Sound(
//             result.buffer,
//             result.channelData.length,
//             result.sampleRate,
//             16,
//         ));
//     }
//     return fileCache.get(file)!;
// }

// function f32tos16(channels: Float32Array[]): Buffer {
//     // channels[0] = channels[0].subarray(0, (channels[0].length / 50)|0);
//     const buffer = Buffer.alloc(channels[0].length * channels.length * 4);
//     for (let i=0; i<channels[0].length; i++)
//         for (let j=0; j<channels.length; j++) 
//             buffer.writeInt16LE(channels[j][i]*Math.pow(2, 16)/2, (i*channels.length+j)*2);
//     return buffer;
// }

// if (require.main === module) {
//     initAudio().then(() => {
//         playSound(process.argv[2]);
//     });
// }