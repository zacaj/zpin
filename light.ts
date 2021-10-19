import { dImage, DisplayContent } from "./disp";

export enum Color {
    Red = 'Red',
    Green = 'Green',
    White = 'White',
    Orange = '#FF3000',
    Yellow = 'Yellow',
    Blue = '#0000A0',
    Purple = '#230054',
    Pink = '#ff0066',
    Black = 'Black',
    Gray = '#393939',
}

export type Frequency = number;

export type NormalizedLight = {
    color: Color;
    type: 'solid'|'pulsing'|'flashing';
    freq: Frequency;
    phase: number;
};

export type LightState = Color|{
    color: Color;
    flashing: true;
    freq: Frequency;
    phase: number;
}|{
    color: Color;
    pulsing: true;
    freq: Frequency;
    phase: number;
}|
NormalizedLight
|[Color|undefined, 'fl'|'flashing'|'pl'|'pulsing'|'flash'|'pulse'|false|undefined, Frequency?, number?]
|undefined|false;
const defaultFlashFreq: Frequency = 3;
const defaultPulseFreq: Frequency = 1;
export function normalizeLight(state: LightState): NormalizedLight|undefined {
    if (!state) return undefined;
    if (typeof state === 'string')
        return {
            color: state,
            type: 'solid',
            freq: defaultFlashFreq,
            phase: 0,
        };
    if (Array.isArray(state)) {
        if (!state[0]) return undefined;
        return {
            color: state[0],
            type: typeof state[1]==='string'? (state[1].startsWith('f')? 'flashing' : 'pulsing') : 'solid',
            freq: state[2] ?? (typeof state[1]==='string'&&state[1]?.startsWith('f')? defaultFlashFreq : defaultPulseFreq),
            phase: state[3] ?? 0,
        };
    }
    if ('type' in state) return state;
    return {
        color: state.color,
        type: 'flashing' in state? 'flashing' : 'pulsing',
        freq: state.freq ?? ('flashing' in state? defaultFlashFreq : defaultPulseFreq),
        phase: state.phase ?? 0,
    };
}

export function colorToHex(color: Color): string|undefined {
    if (typeof color === "string" && color.startsWith("#"))
        return color;
    const colors = {'aliceblue':'#f0f8ff','antiquewhite':'#faebd7','aqua':'#00ffff','aquamarine':'#7fffd4','azure':'#f0ffff',
    'beige':'#f5f5dc','bisque':'#ffe4c4','black':'#000000','blanchedalmond':'#ffebcd','blue':'#0000ff','blueviolet':'#8a2be2','brown':'#a52a2a','burlywood':'#deb887',
    'cadetblue':'#5f9ea0','chartreuse':'#7fff00','chocolate':'#d2691e','coral':'#ff7f50','cornflowerblue':'#6495ed','cornsilk':'#fff8dc','crimson':'#dc143c','cyan':'#00ffff',
    'darkblue':'#00008b','darkcyan':'#008b8b','darkgoldenrod':'#b8860b','darkgray':'#a9a9a9','darkgreen':'#006400','darkkhaki':'#bdb76b','darkmagenta':'#8b008b','darkolivegreen':'#556b2f',
    'darkorange':'#ff8c00','darkorchid':'#9932cc','darkred':'#8b0000','darksalmon':'#e9967a','darkseagreen':'#8fbc8f','darkslateblue':'#483d8b','darkslategray':'#2f4f4f','darkturquoise':'#00ced1',
    'darkviolet':'#9400d3','deeppink':'#ff1493','deepskyblue':'#00bfff','dimgray':'#696969','dodgerblue':'#1e90ff',
    'firebrick':'#b22222','floralwhite':'#fffaf0','forestgreen':'#228b22','fuchsia':'#ff00ff',
    'gainsboro':'#dcdcdc','ghostwhite':'#f8f8ff','gold':'#ffd700','goldenrod':'#daa520','gray':'#808080','green':'#00F000','greenyellow':'#adff2f',
    'honeydew':'#f0fff0','hotpink':'#ff69b4',
    'indianred ':'#cd5c5c','indigo':'#4b0082','ivory':'#fffff0','khaki':'#f0e68c',
    'lavender':'#e6e6fa','lavenderblush':'#fff0f5','lawngreen':'#7cfc00','lemonchiffon':'#fffacd','lightblue':'#add8e6','lightcoral':'#f08080','lightcyan':'#e0ffff','lightgoldenrodyellow':'#fafad2',
    'lightgrey':'#d3d3d3','lightgreen':'#90ee90','lightpink':'#ffb6c1','lightsalmon':'#ffa07a','lightseagreen':'#20b2aa','lightskyblue':'#87cefa','lightslategray':'#778899','lightsteelblue':'#b0c4de',
    'lightyellow':'#ffffe0','lime':'#00ff00','limegreen':'#32cd32','linen':'#faf0e6',
    'magenta':'#ff00ff','maroon':'#800000','mediumaquamarine':'#66cdaa','mediumblue':'#0000cd','mediumorchid':'#ba55d3','mediumpurple':'#9370d8','mediumseagreen':'#3cb371','mediumslateblue':'#7b68ee',
    'mediumspringgreen':'#00fa9a','mediumturquoise':'#48d1cc','mediumvioletred':'#c71585','midnightblue':'#191970','mintcream':'#f5fffa','mistyrose':'#ffe4e1','moccasin':'#ffe4b5',
    'navajowhite':'#ffdead','navy':'#000080',
    'oldlace':'#fdf5e6','olive':'#808000','olivedrab':'#6b8e23','orange':'#ffa500','orangered':'#ff4500','orchid':'#da70d6',
    'palegoldenrod':'#eee8aa','palegreen':'#98fb98','paleturquoise':'#afeeee','palevioletred':'#d87093','papayawhip':'#ffefd5','peachpuff':'#ffdab9','peru':'#cd853f','pink':'#FF00CC','plum':'#dda0dd','powderblue':'#b0e0e6','purple':'#800080',
    'rebeccapurple':'#663399','red':'#ff0000','rosybrown':'#bc8f8f','royalblue':'#4169e1',
    'saddlebrown':'#8b4513','salmon':'#fa8072','sandybrown':'#f4a460','seagreen':'#2e8b57','seashell':'#fff5ee','sienna':'#a0522d','silver':'#c0c0c0','skyblue':'#87ceeb','slateblue':'#6a5acd','slategray':'#708090','snow':'#fffafa','springgreen':'#00ff7f','steelblue':'#4682b4',
    'tan':'#d2b48c','teal':'#008080','thistle':'#d8bfd8','tomato':'#ff6347','turquoise':'#40e0d0',
    'violet':'#ee82ee',
    'wheat':'#f5deb3','white':'#ffffff','whitesmoke':'#f5f5f5',
    'yellow':'#ffff00','yellowgreen':'#9acd32'};

    if ((colors as any)[color.toLowerCase()])
        return (colors as any)[color.toLowerCase()];
    Log.error('console', 'no hex found for color "%s"', color);

    return undefined;
}

export function light(cond: boolean, color: LightState = Color.White, offColor?: LightState): LightState[] {
    return cond? [color] : (offColor? [offColor] : []);
}
export function flash(cond: boolean, color = Color.White, freqOrColor: Frequency|Color = defaultFlashFreq, freq = defaultFlashFreq, phase = 0): LightState[] {
    if (typeof freqOrColor === 'number')
        freq = freqOrColor;
    return cond? [{
        color,
        flashing: true,
        freq,
        phase,
    }] : (typeof freqOrColor !== 'number'? [[freqOrColor, 'flash', freq]] : []);
}
export function flashLight(cond: boolean, color = Color.White, off = Color.Red, freq = defaultFlashFreq, phase = 0): LightState[] {
    return cond? [{
        color,
        flashing: true,
        freq,
        phase,
    }] : [off];
}

export function colorToArrow(color?: Color): DisplayContent|undefined {
    if (!color) return undefined;
    return dImage(Object.entries(Color).find(e => e[1] === color)![0].toLowerCase()+'Arrow');
}

export function mix(func: (() => LightState|undefined)|LightState|undefined): (state?: LightState[]) => LightState[] | undefined {
    return prev => {
        const l = typeof func==='function'? func() : func;
        if (l)
            return [l, ...(prev??[])];
        else
            return prev;
    };
}

export function add(func: (() => boolean)|boolean, color: LightState|(() => LightState)): (state?: LightState[]) => LightState[] | undefined {
    return mix(() => (typeof func==='function'? func() : func)? (typeof color==='function'? color() : color) : undefined);
}

export function many(func: () => [LightState|'prev', boolean][]): (state?: LightState[]) => LightState[] | undefined {
    return (prev) => {
        const o = func();
        let state: LightState[] = [];
        for (const [key, value] of o) {
            if (key === 'prev' && value)
                state = [...state, ...prev ?? []];
            else if (value) {
                state.push(key as Color);
            }
        }
        return state;
    };
}

import {Socket} from 'net';
import { Log } from './log';
import { Image } from "./gfx";
import { Light, machine } from "./machine";
import { fork } from "./promises";
import { wait } from "./timer";
import { split, num } from "./util";

const socket = new Socket();

export const LPU = {
    isConnected: false,
    
    ip: '127.0.0.1',

    timeout: 10,
    connecting: false,

    promises: [] as ((resp: string) => void)[],

    async init(ip?: string) {
        // this.ip = '192.168.2.11';
        if (ip) this.ip = ip;

        socket.setTimeout(1000);
        socket.setNoDelay(true);
        socket.on('error', err => {
            Log.error(['lpu', 'console'],'socket error: ', err);
        });
        socket.on('close', err => {
            this.isConnected = false;
            this.connecting = false;
            Log.error(['lpu', 'console'], 'lost connection to LPU', err);
            this.reconnect();
        });
        this.connect();
    },

    reconnect() {
        if (this.connecting) return;
        this.connecting = true;
        fork(wait(this.timeout*1000).then(() => this.connect()));
        Log.info('lpu', 'reconnect to LPU in %is', this.timeout);
        if (this.timeout < 30)
            this.timeout *= 2;
    },

    connect() {
        if (this.isConnected) return;
        this.connecting = true;
        Log.info(['lpu'], 'connecting to %s', this.ip);
        socket.connect(9999, this.ip, async () => {
            Log.info(['lpu'],'reached LPU');
            this.isConnected = true;
            this.connecting = false;
            this.timeout = 10;

            await this.sendCommand("reset");
            await this.sendCommand(`setup 1,${Math.max(0, ...machine.lights.flatMap(l => l.nums ?? [])) + 1},3`);
            await this.sendCommand('init');
            await this.sendCommand('fill 1,0');
            await this.sendCommand(`thread_start 63, 0
    do
        delay 30
        render
    loop
thread_stop\n\n`);

            Log.log(['lpu', 'console'], 'connected to LPU');

            for (const light of machine.lights) {
                await light.sync();
            }
        });
    },

    async sendCommand(cmd: string, expectedResp: string|null = "", force = false): Promise<void> {
        if (!this.isConnected && !force) {
            Log.info('lpu', 'ignoring command %s, not connected', cmd);
            return;// "fake";
        }
        Log.info('lpu', 'send command %s', cmd);

        socket.write(cmd+(cmd.endsWith('\n')? '' : '\n'));
    },
}