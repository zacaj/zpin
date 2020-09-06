import { AminoGfx, Property, Group, Circle, ImageView, Rect, AminoImage, fonts, Texture, Text, Node } from 'aminogfx-gl';
import { Log } from './log';
import { initMachine } from './init';
import { LightOutputs, ImageOutputs, resetMachine, Solenoid, machine } from './machine';
import { Color, colorToHex } from './light';
import { Switch, onSwitchClose, onSwitch, matrix, getSwitchByName, resetSwitchMatrix } from './switch-matrix';
import { Events, Priorities } from './events';
import { assert, num, tryNum, getCallerLoc } from './util';
// import { Game } from './game';
// import { MPU } from './mpu';
import * as fs from 'fs';
import { wait, Timer, time } from './timer';
import { fork } from './promises';
import { onChange } from './state';

export let gfx: AminoGfx;
let screenW: number;
let screenH: number;
let root: Group;
let playfield: Playfield;
export let screen: Screen;
let isRpi = false;

export async function initGfx() {
    gfx = new AminoGfx();
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

    Log.log('gfx', 'precaching images...');
    await Promise.all(fs.readdirSync('./media').map(async file => {
        if (file.endsWith('.png'))
            await Image.cacheTexture(file.slice(0, file.length - 4));
    }));
    Log.log('gfx', 'precached');

    gfx.fill('#FFFF00');
    gfx.showFPS(false);
    root = gfx.createGroup();
    root.sy(-1);
    gfx.setRoot(root);
    if (gfx.screen.fullscreen) isRpi = true;

    if (isRpi) {
        console.log('size: %i, %i', gfx.w(), gfx.h());
        screenW = gfx.h();
        screenH = gfx.w();
    } else {
        gfx.w(400+Screen.w/2+10);
        gfx.h(800);
        // gfx.h(360);
        // gfx.w(640);
        screenW = 400;
        screenH = 800;
    }
    if (isRpi) {
        root.rz(90);
    }

    root.add(gfx.createCircle().radius(10).x(screenW).y(screenH/-2));
    root.acceptsKeyboardEvents = true;

    playfield = new Playfield();
    root.add(playfield);

    screen = new Screen();
    if (!isRpi) {
        root.add(screen);
        screen.w(Screen.w/2);
        screen.h(Screen.h/2);
        screen.x(screenW+screen.w()/2);
        screen.y(-screenH/2);
    } else {
        playfield.add(screen);
        screen.w(Screen.pw+2);
        screen.h(Screen.ph+2);
        screen.x(5.5+Screen.pw/2);
        screen.y(22.7-Screen.ph/2);
    }
    screen.sx(screen.w()/Screen.w);
    screen.sy(-screen.h()/Screen.h);

    playfield.acceptsMouseEvents = true;
    playfield.acceptsKeyboardEvents = true;
    gfx.on('press', playfield, (e) => {
        console.log('playfield location: ', { x: e.point.x, y: e.point.y });
    });
    // eslint-disable-next-line complexity
    gfx.on('key.press', null, (e) => {
        console.log('key press', e.char, e.keycode, e.key);
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
                    sw.changeState(!sw.state, 'force');
                }
            }
        }

        switch (e.key) {
            case 'LEFT':
                playfield.x(playfield.x()-2);
                break;
            case 'RIGHT':
                playfield.x(playfield.x()+2);
                break;
            case 'DOWN':
                playfield.y(playfield.y()-2);
                break;
            case 'UP':
                playfield.y(playfield.y()+2);
                break;
        }
        switch (e.char) {
            case 'j':
                playfield.sx(playfield.sx()-.01);
                break;
            case 'l':
                playfield.sx(playfield.sx()+.01);
                break;
            case 'k':
                playfield.sy(playfield.sy()-.01);
                break;
            case 'i':
                playfield.sy(playfield.sy()+.01);
                break;
            
            case 'd':
                machine.out!.debugPrint();
                break;
            case 'm':
                Log.log(['console', 'switch', 'mpu', 'solenoid', 'machine', 'gfx', 'game'], 'MARKER');
                break;
            case 's':
                fs.copyFileSync('./switch.log', './recordings/'+time());
                break;
        }
    });
    // playfield.add(gfx.createText().fontName('card').text('test text').y(20).sy(-.05).sx(.05).fontSize(50));

    Log.log('gfx', 'graphics initialized');

    // alert('test text', undefined, 'more test text');
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
        if (isRpi) {
            this.x(-((Playfield.w*screenH/Playfield.h)+gfx.h())/2);
            this.y(0);
        } else {
            this.x(-((Playfield.w*screenH/Playfield.h)-screenW)/2).y(0);
        }
        this.add(gfx.createRect().w(Playfield.w).h(Playfield.h).originX(0).originY(0));
        this.add(this.bg);

        for (const name of Object.keys(gfxLights) as (keyof LightOutputs)[]) {
            gfxLights[name].l = new Light(name);
            this.add(gfxLights[name].l!);
        }

        for (const name of Object.keys(gfxImages) as (keyof ImageOutputs)[]) {
            gfxImages[name].l = new Display(name);
            this.add(gfxImages[name].l!);
        }

        for (const name of Object.keys(gfxSwitches)) {
            gfxSwitches[name].s = new FxSwitch(getSwitchByName(name)!);
            this.add(gfxSwitches[name].s!);
        }

        for (const name of Object.keys(gfxCoils)) {
            gfxCoils[name].c = new FxCoil(Object.values(machine).find(v => v instanceof Solenoid && v.name === name));
            this.add(gfxCoils[name].c!);
        }
    }
}

export class Screen extends Group {
    static readonly w = 1024;
    static readonly h = 600;
    static readonly pw = 8.26;
    static readonly ph = 4.96;

    constructor() {
        super(gfx);
        // this.sx(this.w()/Screen.sw);
        // this.sy(-this.h()/Screen.sh);
        // this.originX(0.5).originY(.5);

        this.add(gfx.createRect().w(Screen.w).h(Screen.h).originX(.5).originY(.5).fill('#000000'));
        
        const circle = gfx.createCircle().radius(11).x(0).y(Screen.h/2);
        circle.x.anim({
            from: -400,
            to: 400,
            duration: 1000,
            loop: -1,
            timeFunc: 'linear',
            autoreverse: false,
        }).start();
        circle.z.anim({
            from: 100,
            to: -100,
            duration: 1000,
            loop: -1,
            timeFunc: 'linear',
            autoreverse: false,
        }).start();
        this.add(circle);

        this.depth(true);

        // this.add(gfx.createRect().fill('#ffffff').w(100).h(100).z(100));
    }
}

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

export class Display extends Group {
    image!: Image;
    node?: Node;
    constructor(public name: keyof ImageOutputs) {
        super(gfx);
        const {x,y,r} = gfxImages[name];
        this.x(x);
        this.y(y);
        this.rz(r ?? 0);
        this.w(80);
        this.h(160);
        this.originX(0.5);
        this.originY(0.5);
        this.sx(1/80).sy(1/80);

        this.add(gfx.createRect().w(this.w()).h(this.h()).fill('#000000').z(-1));

        this.image = new Image(gfx);
        this.image.w(80);
        this.image.h(120);
        this.image.top(1).bottom(0).size('stretch');
        this.add(this.image);
    }

    set(val: string|Node) {
        if (this.node && val !== this.node) {
            this.remove(this.node);
            this.node = undefined;
        }
        if (typeof val === 'string') {
            this.image.visible(true);
            return this.image.set(val);
        } else {
            this.image.visible(false);
            this.node = val;
            this.add(val);
            return undefined;
        }
    }
}

export class Image extends ImageView {
    curVal?: string;
    targetVal?: string;

    static cache: { [name: string]: Texture|Promise<Texture> } = {};
    set(val: string): void {
        this.targetVal = val;
        const image = this;
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
                    debugger;
                    // Log.info('gfx', 'wait for image "%s" to be cached', val);
                    // return (Image.cache[val] as Promise<Texture>).then(tex => {
                    //     if (this.targetVal !== val) return;
                    //     image?.image(tex);
                    //     this.curVal = val;
                    // });
                } else {
                    Log.trace('gfx', 'use cached image for "%s"', val);
                    image?.image(Image.cache[val] as Texture);
                    this.curVal = val;
                }
            }
            else {
                debugger;
                // void Image.cacheTexture(val).then(texture => {     
                //     if (this.targetVal === val) {
                //         image?.image(texture);
                //         this.curVal = val;
                //     }
                // });
                // return Image.cache[val] as Promise<Texture>;
            }
        } else {
            this.curVal = val;
        }
        // console.timeEnd('set image'+n);
        return undefined;
    }

    static cacheTexture(val: string): Promise<Texture> {
        Log.info('gfx', 'new image load for %s', val);
        return Image.cache[val] = new Promise((resolve, reject) => {
            const img = new AminoImage();

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

                Image.cache[val] = texture;
                resolve(texture);
                Log.info('gfx', 'image %s loaded', val);
            });
            };

            img.src = 'media/'+val+'.png';
        });
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
            sw.changeState(!sw.state, 'force');
            if (e.button === 1)
                void wait(250).then(() => sw.changeState(!sw.state, 'force'));
        });
    }
}

class FxCoil extends Rect {
    constructor(
        public coil: Solenoid,
    ) {
        super(gfx);
        assert(coil);

        this.originX(0.5).originY(0.5);
        this.w(0.5).h(0.5);
        this.rz(45);

        const {x,y} = gfxCoils[coil.name];
        this.x(x).y(y);

        this.fill(coil.actual? '#ff0000' : '#ffffff');
        Events.listen(() => {
            this.fill(coil.actual? '#ff0000' : '#fffff');
        }, onChange(coil, 'actual'));
    }
}

if (require.main === module) {
    // prom
    // initMachine().then(() => initGfx());
    Log.init();
    resetSwitchMatrix();
    resetMachine();
    // prom
    // MPU.init('localhost').then(() => 
    void initGfx().then(() => {
        // const game = Game.start();
    });//);
}

export function makeImage(name: string, w: number, h: number, flip = true): Image {
    const img = new Image(gfx).opacity(1.0).w(w).h(h);
    if (flip) img.top(1).bottom(0);
    img.size('stretch');
    img.set(name);
    return img;
}

export function makeText(text: string, height: number,
    align: 'corner'|'center'|'left'|'right' = 'center',
    vAlign: 'baseline'|'top'|'middle'|'bottom'|undefined = undefined,
): Text {
    return gfx.createText().fontName('card').sy(1).sx(1).text(text).fontSize(height)
        .align(align==='corner'? 'left' : align)
        .vAlign(align==='corner'? 'top' : (vAlign!==undefined? vAlign: 'middle'));
}

export const gfxLights: { [name in keyof LightOutputs]: {
    x: number;
    y: number;
    d: number;
    l?: Light;
}} = {
    lLowerRamp: { x: 15.6, y: 17.3, d: 5/8 },
    lMiniReady: { x: 2.53125, y: 11.25, d: 5/8 },
    lShooterShowCards:  { x: 18.05625, y: 25.9875, d: 5/8 },
    lShooterStartHand:  { x: 18.05625, y: 27.39375, d: 3/4 },
    lEjectShowCards:  { x: 8.8875, y: 39.43125, d: 5/8 },
    lEjectStartMode:  { x: 9, y: 37.2375, d: 3/4 },
    lRampArrow:  { x: 3.65625, y: 29.86875, d: 1 },
    lRampShowCards:  { x: 3.99375, y: 28.29375, d: 5/8 } ,  
    lRampStartMb:  { x: 4.1625, y: 27.337500000000002, d: 3/4 } ,  
    lPower1: { x: 7.199999999999999, y: 10.575000000000003, d: 5/8 },
    lPower2: { x: 8.4375, y: 10.181249999999999, d: 5/8 },
    lPower3: { x: 9.9, y: 10.125, d: 5/8 },
    lPower4: { x: 11.30625, y: 10.631250000000001, d: 5/8 },
    lPopperStatus:  { x: 16.03125, y: 9.5625, d: 3/4 },
    lMagnaSaveStatus:  { x: 2.9812499999999997, y: 18.95625, d: 3/4 },
    lLaneUpperLeft: { x: 11.081249999999999, y: 41.625, d: 1 },
    lLaneUpperCenter: { x: 12.993749999999999, y: 41.5125, d: 1 },
    lLaneUpperRight: { x: 14.34375, y: 41.34375, d: 1 },
    lLaneLowerLeft: { x: 14.34375, y: 39.4875, d: 1 },
    lLaneLowerCenter: { x: 16.03125, y: 39.375, d: 1 },
    lLaneLowerRight: { x: 17.4375, y: 39.31875, d: 1 },
};

export const gfxImages: { [name in keyof ImageOutputs]: {
    x: number;
    y: number;
    r?: number;
    l?: Display;
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
    iSS1: { x: 19.8, y: 23.5125, r: 90 },
    iSS2: { x: 18.05625, y: 31.725, r: 90 },
    iSS3: { x: 19.912499999999998, y: 37.35, r: 90 },
    iSS4: { x: 17.26875, y: 40.95, r: 90 },
    iSS5: { x: 13.837499999999999, y: 43.70625, r: 90 },
    iSS6: { x: 6.4125, y: 42.525, r: 90 },
    iSS7: { x: 0.8999999999999999, y: 25.875, r: 90 },
    iSpinner: { x: 16.837499999999999, y: 35.70625, r: 90 },
};

const gfxCoils: { [name: string]: {
    x: number;
    y: number;
    c?: FxCoil;
};} = {
    'shooterDiverter': { x: 17.75, y: 18.45625 },
    'lockPost': { x: 1.74375, y: 29.64375 },
    'miniDiverter': { x: 2.30625, y: 9.731250000000003 },
    'centerBank':  { x: 11.19375, y: 27.337500000000002 },
    'leftBank':  { x: 1.4625, y: 23.90625 },
    'realRightBank':  { x: 14.943749999999998, y: 23.7375 },
    'rightBank':  { x: 14.943749999999998, y: 21.7375 },
    'right1': { x: 17.49375, y: 26.1 },
    'right2': { x: 17.83125, y: 25.087500000000002 },
    'right3': { x: 17.943749999999998, y: 23.7375 },
    'miniBank': { x: 4.3875, y: 8.100000000000001 },
    'rampUp': { x: 3.15, y: 31.725 },
    'leftGate': { x: 11.75625, y: 44.15625 },
    'rightGate': { x: 19.0125, y: 41.5125 },
    'upperMagnet': { x: 17.381249999999998, y: 36.5625 },
    'magnetPost': { x: 18.61875, y: 34.65 },
    'upper3': { x: 11.75625, y: 39.09375 },
    'upper2': { x: 6.637499999999999, y: 39.88125 },
    'popper': { x: 14.174999999999999, y: 7.481250000000003 },
    'leftMagnet': { x: 2.475, y: 18.675 },
    'outhole': { x: 8.4375, y: 1.96875 },
    'troughRelease': { x: 16.3125, y: 2.0249999999999986 },
    'miniEject': { x: 6.1875, y: 2.3625000000000043 },
    'upperEject': { x: 5.0625, y: 40.5 },
    'miniFlipperEnable': { x: 3.15, y: 3.65625 },
};
const gfxSwitches: { [name: string]: {
    x: number;
    y: number;
    s?: FxSwitch;
};} = {
    'right inlane': { x: 15.75, y: 14.45625 },
    'center left': {
        x: 9.7875,
        y: 26.83125,
    },
    'center center': {
        x: 10.799999999999999,
        y: 26.6625,
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
    'pop':  { x: 12.487499999999999, y: 33.8625 },
    'upper 2 left':  { x: 6.2437499999999995, y: 39.15 },
    'upper 2 right':  { x: 7.3687499999999995, y: 39.43125 },
    'upper 3 left':  { x: 10.575, y: 39.825 },
    'upper 3 center':  { x: 11.25, y: 38.925 },
    'upper 3 right':  { x: 12.206249999999999, y: 38.025 },
    'shooter lane': { x: 19.18125, y: 5.625 },
    'shooter lower': { x: 19.18125, y: 21.65625 },
    'shooter magnet': { x: 19.18125, y: 33.69375},
    'outhole': { x: 9.5625, y: 3.2062500000000043 },
    'trough full': { x: 13.95, y: 2.700000000000003 },
    'mini left': { x: 2.925, y: 7.818750000000001 },
    'mini center': { x: 3.8812499999999996, y: 7.481250000000003 },
    'mini right': { x: 5.23125, y: 6.918750000000003 },
    'magnet button': { x: 0.39375, y: 3.3187500000000014 },
    'popper button': { x: 18.95625, y: 4.387500000000003 },
    'shooter upper':  { x: 19.125, y: 38.475 },
    'back lane':  { x: 11.924999999999999, y: 40.33125 },
    'upper lane left':  { x: 12.993749999999999, y: 41.5125 },
    'upper lane right':  { x: 14.34375, y: 41.34375 },
    'lower lane left':  { x: 14.34375, y: 39.4875 },
    'lower lane center':  { x: 16.03125, y: 39.375 },
    'lower lane right':  { x: 17.4375, y: 39.31875 },
    'upper eject':  { x: 4.78125, y: 39.375 },
    'left inlane':  { x: 1.18125, y: 15.693750000000001 },
    'spinner': { x: 17.662499999999998, y: 33.35625 },
    'under ramp': { x: 2.4187499999999997, y: 34.25625 },
    'left orbit': { x: 1.0125, y: 39.76875 },
    'left outlane': { x: 2.5875, y: 15.1875 },
    'right outlane': { x: 16.9875, y: 14.681250000000002 },
    'mini entry': { x: 1.4625, y: 7.931249999999999 },
    'mini missed': { x: 3.5999999999999996, y: 9.168750000000003 },
    'mini out': { x: 5.90625, y: 1.0687500000000014 },
    'ramp mini outer': { x: 1.85625, y: 28.743750000000002 },
    'ramp mini': { x: 2.8125, y: 28.125 },
    'under upper flipper': { x: 4.95, y: 30.0375 },
    'upper inlane': { x: 4.44375, y: 35.60625 },
    'upper side target': { x: 3.43125, y: 37.29375 },
    'spinner mini': { x: 15.524999999999999, y: 34.14375 },
    'single standup': { x: 6.4125, y: 28.575 },
    'side pop mini': { x: 16.425, y: 37.2375 },
    'upper pop mini': { x: 13.612499999999999, y: 36.95625 },
    'left back 2': { x: 1.85625, y: 25.3125 },
    'left back 1': { x: 1.6875, y: 24.3 },
    'start button': { x: 2.90625, y: 1.0687500000000014 },
};

class FakeGroup implements Pick<Group, 'add'|'remove'|'clear'> {
    add(...nodes: Node[]): Group {
        return this as any;
    }
    remove(...nodes: Node[]): Group {
        return this as any;
    }
    clear(): Group {
        return this as any;
    }
}

export function createGroup(): Group|undefined {
    if (gfx) return gfx.createGroup();
    return undefined;
}

export async function popup(node: Node, ms = 2000) {
    // if (!gfx) return;
    // node.x(Screen.w/2);
    // node.y(Screen.h/2);
    if (gfx) {
        node.z(100);
        screen.add(node);
    }
    await wait(ms, 'popup');
    if (gfx) screen.remove(node);
    return;
}

export function alert(text: string, ms?: number, subtext?: string): [Group, Promise<void>] {
    let g: Group;
    if (gfx) {
        Log.log(['gfx', 'console'], 'alert message %s / %s', text, subtext);
        g = gfx.createGroup().y(-Screen.h * .2);
        const t = makeText(text, 70, 'center', 'top').wrap('word').w(Screen.w *.6).x(-Screen.w*0.6/2);
        const t2 = subtext? makeText(subtext, 35, 'center', 'top').wrap('word').w(t.w()).x(t.x()) : undefined;

        // g.add(gfx.createRect().x(t.x()).w(t.w()).h(50).fill('#ff0000').z(-2));
        const r = gfx.createRect().fill('#111111').z(-.1);
        function setW() {
            r.w(Math.max(t.lineW(), t2?.lineW() ?? 0));
            r.x((t.w()-r.w())/2 + t.x());
        }
        t.lineW.watch(setW);
        t2?.lineW.watch(setW);
        setW();
        function setH() {
            r.h(t.lineNr()*t.fontSize()+(t2?.lineNr()??0)*(t2?.fontSize()??0));
            t2?.y(t.lineNr()*t.fontSize());
        }
        t.lineNr.watch(setH);
        t2?.lineNr.watch(setH);
        setH();
        g.add(r, t);
        if (t2)
            g.add(t2);
    } else {
        g = new FakeGroup() as any;
    }

    return [g, popup(g, ms)]; 
}