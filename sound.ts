const Speaker = require('speaker');
import { Mixer } from 'audio-mixer';
import * as fs from 'fs';
import * as Path from 'path';
const wav = require('node-wav');

let mixer: Mixer;

export async function initAudio() {
    mixer = new Mixer({
        channels: 2,
        sampleRate: 44100,
        bitDepth: 16,
    });
    mixer.pipe(new Speaker({
        channels: 2,
        sampleRate: 44100,
        bitDepth: 16,
    }));
}

export class Sound {
    get length(): number {
        return this.sampleCount / this.sampleRate;
    }
    get sampleCount(): number {
        return this.buffer.length/this.channels/this.bitDepth*8;
    }
    constructor(
        public buffer: Buffer,
        public channels: number,
        public sampleRate: number,
        public bitDepth: number,
    ) {

    }
}

export interface SoundInstance {
    sound: Sound;
    ended: Promise<void>;
}

export function playSound(file: string, volume = 50): SoundInstance {
    if (!mixer) return null as any;
    const sound = getSound(file);
    console.time('play');
    const input = mixer.input({
        sampleRate: sound.sampleRate,
        channels: sound.channels,
        bitDepth: sound.bitDepth,
    });
    input.setVolume(volume);
    input.write(sound.buffer, () => 
        console.timeEnd('play'));
    let done: any;
    const instance: SoundInstance = {
        sound,
        ended: new Promise(resolve => done = resolve),
    };
    setTimeout(() => {
        mixer.removeInput(input);
        done();
    }, sound.length*1000);
    return instance;
}

const soundCache = new Map<string, Sound>();
function getSound(file: string) {
    if (!soundCache.has(file)) {
        console.time(file);
        const buffer = fs.readFileSync(Path.isAbsolute(file)? file : Path.join('media', file));
        const result = wav.decode(buffer);
        result.buffer = f32tos16(result.channelData);
        console.timeEnd(file);
        soundCache.set(file, new Sound(
            result.buffer,
            result.channelData.length,
            result.sampleRate,
            16,
        ));
    }
    return soundCache.get(file)!;
}

function f32tos16(channels: Float32Array[]): Buffer {
    // channels[0] = channels[0].subarray(0, (channels[0].length / 50)|0);
    const buffer = Buffer.alloc(channels[0].length * channels.length * 4);
    for (let i=0; i<channels[0].length; i++)
        for (let j=0; j<channels.length; j++) 
            buffer.writeInt16LE(channels[j][i]*Math.pow(2, 16)/2, (i*channels.length+j)*2);
    return buffer;
}

if (require.main === module) {
    initAudio().then(() => {
        playSound(process.argv[2]);
    });
}