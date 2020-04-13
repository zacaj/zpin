import { AminoGfx, Property, Group, Circle, ImageView, Rect, AminoImage, fonts, Texture } from 'aminogfx-gl';
import { Log } from './log';
import { initMachine } from './init';
import { LightOutputs, ImageOutputs, resetMachine } from './machine';
import { Color, colorToHex } from './light';
import { Switch, onSwitchClose, onSwitch, matrix, getSwitchByName, resetSwitchMatrix } from './switch-matrix';
import { Events } from './events';
import { assert, num, tryNum } from './util';
import { Game } from './game';
import { MPU } from './mpu';
import * as fs from 'fs';

export let gfx: AminoGfx = new AminoGfx();
let screenW: number;
let screenH: number;
let root: Group;
let playfield: Playfield;
export let screen: Screen;

export async function initGfx() {
    await new Promise((resolve, reject) => {
        gfx.start((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    Log.info('gfx', 'amino initialized');

    fonts.registerFont({
        name: 'card',
        path: './media/',
        weights: {
            400: {
                normal: 'CARDC__.TTF',
            },
        },
    });

    gfx.fill('#FFFF00');
    gfx.showFPS(false);
    root = gfx.createGroup();
    root.sy(-1);
    gfx.setRoot(root);

    if (gfx.screen.fullscreen) {
        console.log('size: %i, %i', gfx.w(), gfx.h());
        screenW = gfx.h();
        screenH = gfx.w();
    } else {
        gfx.w(400);
        gfx.h(800);
        // gfx.h(360);
        // gfx.w(640);
        screenW = 400;
        screenH = 800;
    }
    if (gfx.w() > gfx.h()) {
        root.rz(90);
    }

    root.add(gfx.createCircle().radius(10));
    root.acceptsKeyboardEvents = true;

    playfield = new Playfield();
    root.add(playfield);

    // screen = new Screen();
    playfield.add(screen);
    screen.x(5.5+Screen.w/2);
    screen.y(22.7-Screen.h/2);

    playfield.acceptsMouseEvents = true;
    playfield.acceptsKeyboardEvents = true;
    gfx.on('press', playfield, (e) => {
        console.log('playfield location: ', { x: e.point.x, y: e.point.y });
    });
    gfx.on('key.press', null, (e) => {
        console.log('key press', e.char, e.keycode);
        if (e.char) {
            let letter: number|undefined;
            let number: number|undefined;
            const qwerty = [81, 87, 69, 82, 84, 89, 85, 73, 79, 80];
            const numbers = [49, 50, 51, 52, 53, 54, 55, 56, 57, 48];
            if (qwerty.includes(e.keycode))
                letter = qwerty.indexOf(e.keycode);
            if (numbers.includes(e.keycode))
                number = numbers.indexOf(e.keycode);
            if (!letter) 
                letter = qwerty.findIndex(q => gfx.inputHandler.statusObjects.keyboard.state[q]);
            if (!number)
                number = numbers.findIndex(q => gfx.inputHandler.statusObjects.keyboard.state[q]);
            if (letter >= 0 && number >= 0) {
                const sw = matrix[letter][number];  
                if (!sw) 
                    Log.error(['gfx', 'switch'], 'no active switch at %i, %i', letter, number);
                else {  
                    Log.info(['gfx', 'switch', 'console'], 'force state of %s to %s', sw.name, !sw.state? 'on':'off');
                    sw.changeState(!sw.state);
                }
            }
        }
    });
    // playfield.add(gfx.createText().fontName('card').text('test text').y(20).sy(-.05).sx(.05).fontSize(50));

    Log.log('gfx', 'precaching images');
    for (const file of fs.readdirSync('./media')) {
        if (!file.endsWith('.png')) continue;
        await Image.set(null, file.slice(0, file.length - 4));
    }

    Log.log('gfx', 'graphics initialized');
}

export class Playfield extends Group {
    static readonly w = 20.25;
    static readonly h = 45;

    bg = makeImage('pf', Playfield.w, Playfield.h);

    constructor() {
        super(gfx);
        this.w(Playfield.w);
        this.h(Playfield.h);
        this.originX(0).originY(1);
        this.sx(screenH/Playfield.h);
        this.sy(screenH/Playfield.h);
        if (gfx.w() > gfx.h()) {
            this.x(-((Playfield.w*screenH/Playfield.h)+gfx.h())/2);
            this.y(0);
        } else {
            this.x(-((Playfield.w*screenH/Playfield.h)-screenW)/2).y(0);
        }
        this.add(gfx.createRect().w(Playfield.w).h(Playfield.h).originX(0).originY(0));
        this.add(this.bg);

        this.add(new Screen());

        for (const name of Object.keys(gfxLights) as (keyof LightOutputs)[]) {
            gfxLights[name].l = new Light(name);
            this.add(gfxLights[name].l!);
        }

        for (const name of Object.keys(gfxImages) as (keyof ImageOutputs)[]) {
            gfxImages[name].l = new Image(name);
            this.add(gfxImages[name].l!);
        }

        for (const name of Object.keys(gfxSwitches)) {
            gfxSwitches[name].s = new FxSwitch(getSwitchByName(name)!);
            this.add(gfxSwitches[name].s!);
        }
    }
}

export class Screen extends Group {
    static readonly w = 8.26;
    static readonly h = 4.96;
    static readonly sw = 1024;
    static readonly sh = 600;

    constructor() {
        super(gfx);
        this.w(Screen.w);
        this.h(Screen.h);
        this.sx(Screen.w/Screen.sw);
        this.sy(-Screen.h/Screen.sh);
        this.originX(0.5).originY(.5);

        this.add(gfx.createRect().w(Screen.sw).h(Screen.sh).originX(.5).originY(.5).fill('#000000'));
        
        const circle = gfx.createCircle().radius(11).x(0).y(0);
        circle.x.anim({
            from: -400,
            to: 400,
            dur: 1000,
            loop: -1,
            timefunc: 'linear',
            autoreverse: false,
        }).start();
        this.add(circle);
    }
}
screen = new Screen();

class Light extends Circle {

    constructor(
        public name: keyof LightOutputs,
    ) {
        super(gfx);
        const {x,y,d} = gfxLights[name];
        this.radius(d/2);
        this.x(x);
        this.y(y);
        this.set([]);
    }

    set(val: Color[]) {
        if (val.length) {
            this.fill(colorToHex(val[0])!);
        } else {
            this.fill('#FFFFFF');
        }
        this.filled(val.length !== 0);
    }
}

export class Image extends ImageView {

    constructor(
        public name: keyof ImageOutputs,
    ) {
        super(gfx);
        const {x,y,r} = gfxImages[name];
        this.x(x);
        this.y(y);
        this.rz(r ?? 0);
        this.w(1);
        this.h(1.5);
        this.originX(0.5);
        this.originY(0.5);
        this.top(1).bottom(0).size('stretch');
        this.set('empty');
    }

    set(val: string) {
        return Image.set(this, val);
    }

    static cache: { [name: string]: Texture|Promise<Texture> } = {};
    static set(image: ImageView|null, val: string): Promise<any>|undefined {
        // if (image?.src() === val) {
        //     Log.trace('gfx', 'image %s set to same image, ignoring', val);
        //     return;
        // }
        // const n = Math.random();
        // console.time('set image'+n);
        image?.visible(val.length > 0);
        if (val.length > 0) {
            if (Image.cache[val]) {
                if ('then' in Image.cache[val]) {
                    Log.info('gfx', 'wait for image "%s" to be cached', val);
                    return (Image.cache[val] as Promise<Texture>).then(tex => image?.image(tex));
                } else {
                    Log.trace('gfx', 'use cached image for "%s"', val);
                    image?.image(Image.cache[val] as Texture);
                }
            }
            else {
                Log.info('gfx', 'new image load for %s', val);
                const img = new AminoImage();
                Image.cache[val] = new Promise((resolve, reject) => {
                    img.onload = (err) => {
                        if (err) {
                            Log.error('gfx', 'error loading image "%s": ', val, err);
                            // debugger;
                            reject(err);
                            return;
                        }
                        
                        const texture = gfx.createTexture();
                        texture.loadTextureFromImage(img, (err) => {
                            if (err) {
                                Log.error('gfx', 'error loading image "%s": ', val, err);
                            // debugger;
                            reject(err);
                            return;
                        }

                        image?.image(texture);
                        Image.cache[val] = texture;
                        resolve(texture);
                        Log.info('gfx', 'image %s loaded', val);
                    });
                    };
                });
                img.src = 'media/'+val+'.png';
                return Image.cache[val] as Promise<Texture>;
            }
        }
        // console.timeEnd('set image'+n);
        return undefined;
    }
}

class FxSwitch extends Rect {
    constructor(
        public sw: Switch,
    ) {
        super(gfx);
        assert(sw);
        this.acceptsMouseEvents = true;

        this.originX(0.5).originY(0.5);
        this.w(0.5).h(0.5);

        const {x,y} = gfxSwitches[sw.name];
        this.x(x).y(y);

        this.fill(sw.state? '#ff0000' : '#ffffff');
        Events.listen(() => {
            this.fill(sw.state? '#ff0000' : '#fffff');
        }, onSwitch(sw));

        gfx.on('press', this, (e) => {
            Log.info(['gfx', 'switch', 'console'], 'force state of %s to %s', sw.name, !sw.state? 'on':'off');
            sw.changeState(!sw.state);
        });
    }
}

if (require.main === module) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    // initMachine().then(() => initGfx());
    Log.init();
    resetSwitchMatrix();
    resetMachine();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    // MPU.init('localhost').then(() => 
    initGfx().then(() => {
        const game = Game.start();
    })//);
}

export function makeImage(name: string, w: number, h: number, flip = true): ImageView {
    const img = gfx.createImageView().opacity(1.0).w(w).h(h);
    if (flip) img.top(1).bottom(0)
    img.size('stretch');
    Image.set(img, name);
    return img;
}


export const gfxLights: { [name in keyof LightOutputs]: {
    x: number;
    y: number;
    d: number;
    l?: Light;
}} = {
    lLowerRamp: { x: 15.6, y: 17.3, d: 5/8 },
};

export const gfxImages: { [name in keyof ImageOutputs]: {
    x: number;
    y: number;
    r?: number;
    l?: Image;
}} = {
    iCenter1: { x: 9.5, y: 25.65, r: -17 },
    iCenter2: { x: 10.7, y: 25.35, r: -17 },
    iCenter3: { x: 12.0, y: 24.95, r: -17 },
    iLeft1: { x: 3, y: 21.5, r: 77.6 },
    iLeft2: { x: 3.25, y: 22.7, r: 77.6 },
    iLeft3: { x: 3.5, y: 23.9, r: 77.6 },
    iLeft4: { x: 3.75, y: 25.1, r: 77.6 },
    iRight1: { x: 16.1, y: 25.4, r: -77.6 },
    iRight2: { x: 16.3, y: 24.32, r: -77.6 },
    iRight3: { x: 16.5, y: 23.25, r: -77.6 },
    iRight4: { x: 16.7, y: 22.17, r: -77.6 },
    iRight5: { x: 17.1, y: 21.1, r: -77.6 },
    iUpper21: { x: 6.9, y: 38.0, r: -157-180 },
    iUpper22: { x: 7.95, y: 38.37, r: -157-180 },
    iUpper31: { x: 9.8, y: 38.9, r: -42 },
    iUpper32: { x: 10.5, y: 38.1, r: -42 },
    iUpper33: { x: 11.5, y: 37.3, r: -42 },
    iMini1: { x: 2.5, y: 6.8, r: 153-180 },
    iMini2: { x: 3.6, y: 6.25, r: 153-180 },
    iMini3: { x: 4.8, y: 5.78, r: 153-180 },
};

const gfxSwitches: { [name: string]: {
    x: number;
    y: number;
    s?: FxSwitch;
}} = {
    'right inlane': { x: 15.75, y: 14.45625 },
    'center left': {
        x: 9.7875,
        y: 26.83125
    },
    'center center': {
        x: 10.799999999999999,
        y: 26.6625
    },
    'center right': {
        x: 12.206249999999999,
        y: 26.38125,
    },
    'right 1': {
        x: 16.93125,
        y: 25.875,
    },
    'right 2': {
        x: 17.15625,
        y: 24.75,
    },
    'right 3': {
        x: 17.49375,
        y: 23.681250000000002,
    },
    'right 4': {
        x: 17.71875,
        y: 22.556250000000002,
    },
    'right 5': {
        x: 17.943749999999998,
        y: 21.31875,
    },
    'left 1': {
        x: 1.7999999999999998,
        y: 21.88125,
    },
    'left 2': {
        x: 2.08125,
        y: 23.00625,
    },
    'left 3': {
        x: 2.30625,
        y: 24.1875,
    },
    'left 4': {
        x: 2.64375,
        y: 25.650000000000002,
    },
    'ramp made':  { x: 2.5875, y: 38.025 },
    'upper 2 left':  { x: 6.2437499999999995, y: 39.15 },
    'upper 2 right':  { x: 7.3687499999999995, y: 39.43125 },
    'upper 3 left':  { x: 10.575, y: 39.825 },
    'upper 3 center':  { x: 11.25, y: 38.925 },
    'upper 3 right':  { x: 12.206249999999999, y: 38.025 },
};