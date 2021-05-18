import { AminoGfx, AminoImage, Circle, fonts, Group, ImageView, Node, Polygon, Rect, Text, Texture } from 'aminogfx-gl';
// import { Game } from './game';
// import { MPU } from './mpu';
import * as fs from 'fs';
import { DisplayContent } from './disp';
import { EventListener, Events } from './events';
import { Color, colorToHex, LightState, normalizeLight } from './light';
import { Log } from './log';
import { ImageOutputs, ImageType, LightOutputs, machine, resetMachine, Solenoid } from './machine';
import { Mode } from './mode';
import { onChange } from './state';
import { getSwitchByName, matrix, onSwitch, resetSwitchMatrix, Switch } from './switch-matrix';
import { time, wait } from './timer';
import { TreeChangeEvent } from './tree';
import { assert, eq } from './util';
const argv = require('yargs').argv;

export let gfx: AminoGfx;
export let pfx: AminoGfx|undefined;
let screenW: number;
let screenH: number;
let playfield: Playfield|undefined;
export let screen: Screen;
let isRpi = false;
const showPf = argv.showPf ?? false;
const split = argv.split ?? false;
const swap = argv.swap ?? false;
const halfScreen = argv.half ?? false;
const showDisp = !isRpi && !split;

// eslint-disable-next-line complexity
export async function initGfx() {
    gfx = new AminoGfx({display: isRpi? (swap? 'HDMI-A-2':'HDMI-A-1') : undefined});
    await new Promise((resolve, reject) => {
        gfx.start((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    gfx.fill('#FFFF00');
    gfx.showFPS(false);
    gfx.title('Screen');
    if (gfx.screen.fullscreen) isRpi = true;

    if (isRpi) {
        // gfx.w(1280);
        // gfx.h(720);
    } else {
        if (split) {
            gfx.w(Screen.w*2/3);
            gfx.h(Screen.h*2/3);
        } else {
            gfx.w(400+Screen.w/2+10);
            gfx.h(800);
        }
    }

    if (showPf) {
        if (split) {
            pfx = new AminoGfx({display: isRpi? (!swap? 'HDMI-A-2':'HDMI-A-1') : undefined});
            pfx.showFPS(false);
            pfx.title('Playfield');
            await new Promise((resolve, reject) => {
                pfx!.start((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            pfx.fill('#FFFF00');
            if (isRpi) {
                // pfx.w(1280);
                // pfx.h(720);
            } else {
                pfx.w(400);
                pfx.h(800);
                pfx.x.watch(() => gfx.x(pfx!.x()+pfx!.w()+20), true);
                pfx.y.watch(() => gfx.y(pfx!.y()+pfx!.h()/4), true);
            }
        } else {
            pfx = gfx;
            gfx.title('Z-Pin');
        }
    }
    
    Log.info('gfx', 'amino initialized');

    fonts.registerFont({
        name: 'card',
        path: './media/',
        weights: {
            400: {
                normal: 'CardCharacters.ttf',
            },
        },
    });

    Log.log('gfx', 'precaching images...');
    await Promise.all(fs.readdirSync('./media').map(async file => {
        if (file.endsWith('.png'))
            await Image.cacheTexture(file.slice(0, file.length - 4));
    }));
    Log.log('gfx', 'precached');


    screen = new Screen(gfx);
    if (split || !showPf) {
        gfx.setRoot(screen);
        if (halfScreen) {
            screen.w(gfx.w()/1.7);
            screen.h(gfx.h()/1.7);
            screen.x(screen.w()/2);
            screen.y(screen.h()*.85);
            screen.sx(screen.w()/Screen.w);
            screen.sy(screen.h()/Screen.h);
        } else {
            screen.w(gfx.w());
            screen.h(gfx.h());
            screen.x(screen.w()/2);
            screen.y(screen.h()/2);
            screen.sx(screen.w()/Screen.w);
            screen.sy(screen.h()/Screen.h);
        }
    }

    
    if (pfx) {
        const root = pfx.createGroup();
        root.sy(-1);
        pfx.setRoot(root);
        root.acceptsKeyboardEvents = true;

        if (isRpi) {
            root.rz(90);
        }
    
        if (isRpi) {
            console.log('size: %i, %i', pfx.w(), pfx.h());
            screenW = pfx.h();
            screenH = pfx.w();
        } else {
            if (split) {
                pfx.w(400);
                pfx.h(800);
            }
            // pfx.h(360);
            // pfx.w(640);
            screenW = 400;
            screenH = 800;
        }

        playfield = new Playfield();
        root.add(playfield);
        
        if (!split) {
            if (!isRpi) {
                root.add(screen);
                screen.w(Screen.w/2);
                screen.h(Screen.h/2);
                screen.x(screenW+screen.w()/2);
                screen.y(-screenH/4*3);
            } else {
                playfield.add(screen);
                screen.w(Screen.pw+2);
                screen.h(Screen.ph+2);
                screen.x(5.5+Screen.pw/2);
                screen.y(22.7-Screen.ph/2);
            }
            screen.sx(screen.w()/Screen.w);
            screen.sy(-screen.h()/Screen.h);
        }
        
        root.add(pfx.createCircle().radius(10).x(screenW).y(screenH/-2));
        
        playfield.acceptsMouseEvents = true;
        playfield.acceptsKeyboardEvents = true;
        pfx.on('press', playfield, (e) => {
            console.log('playfield location: ', { x: e.point.x, y: e.point.y });
        });

         // eslint-disable-next-line complexity
        pfx.on('key.press', null, (e) => {
            if (!playfield) return;
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
                    letter = qwerty.findIndex(q => pfx!.inputHandler.statusObjects.keyboard.state[q]);
                if (!number)
                    number = numbers.findIndex(q => pfx!.inputHandler.statusObjects.keyboard.state[q]);
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
                    playfield.sx(playfield.sx()-.02);
                    break;
                case 'l':
                    playfield.sx(playfield.sx()+.02);
                    break;
                case 'k':
                    playfield.sy(playfield.sy()+.01);
                    break;
                case 'i':
                    playfield.sy(playfield.sy()-.01);
                    break;
                case 'u':
                    playfield.rz(playfield.rz()-.1);
                    break;
                case 'o':
                    playfield.rz(playfield.rz()+.1);
                    break;

                
                case 'a': {
                    const adj = {x: playfield.x(), y: playfield.y(), sx: playfield.sx(), sy: playfield.sy(), rz: playfield.rz()};
                    Log.log('console', 'adjustments', adj);
                    fs.writeFileSync('projector.json', JSON.stringify(adj, null, 2));
                    break;
                }
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
    }

    Log.log('gfx', 'graphics initialized');
}

export class Playfield extends Group {
    static readonly w = 20.25;
    static readonly h = 45;

    bg = makeImage('pf', Playfield.w, Playfield.h, undefined, this.amino);

    constructor() {
        super(pfx!);
        this.w(Playfield.w);
        this.h(Playfield.h);
        this.originX(0).originY(1);
        this.rz(0);
        this.sx(screenH/Playfield.h);
        this.sy(screenH/Playfield.h);
        if (isRpi) {
            this.x(-((Playfield.w*screenH/Playfield.h)+pfx!.h())/2);
            this.y(0);

            try {
                const json = fs.readFileSync('projector.json', 'utf8');
                const adj = JSON.parse(json); // {} as any; // 
                this.x(adj.x ?? this.x());
                this.y(adj.y ?? this.y());
                this.sx(adj.sx ?? this.sx());
                this.sy(adj.sy ?? this.sy());
                this.rz(adj.rz ?? this.rz());
            } catch (e) {
                debugger;
            }
        } else {
            this.x(-((Playfield.w*screenH/Playfield.h)-screenW)/2).y(0);
        }
        this.add(pfx!.createRect().w(Playfield.w).h(Playfield.h).originX(0).originY(0).fill('#000000'));
        if (split)
            this.bg.opacity(.8);
            this.add(this.bg);

        for (const name of Object.keys(gfxLights) as (keyof LightOutputs)[]) {
            gfxLights[name].l = new (gfxLights[name].d? CircleLight: ArrowLight)(name);
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

    circle!: Circle;

    constructor(g: AminoGfx) {
        super(g);
        // this.sx(this.w()/Screen.sw);
        // this.sy(-this.h()/Screen.sh);
        // this.originX(0.5).originY(.5);

        this.add(g.createRect().w(Screen.w).h(Screen.h).originX(.5).originY(.5).fill('#000000'));
        
        this.circle = g.createCircle().radius(11).x(0).y(Screen.h/2).z(90);
        // circle.x.anim({
        //     from: -400,
        //     to: 400,
        //     duration: 1000,
        //     loop: -1,
        //     timeFunc: 'linear',
        //     autoreverse: false,
        // }).start();
        // circle.z.anim({
        //     from: 100,
        //     to: -100,
        //     duration: 1000,
        //     loop: -1,
        //     timeFunc: 'linear',
        //     autoreverse: false,
        // }).start();
        this.add(this.circle);

        this.depth(true);

        // this.add(pfx.createRect().fill('#ffffff').w(100).h(100).z(100));
    }
}

abstract class Light extends Group {
    shape!: Polygon;
    timer?: any;
    lastState = '';

    constructor(
        public name: keyof LightOutputs,
    ) {
        super(pfx!);
        const {x,y} = gfxLights[name];
        this.x(x);
        this.y(y);
    }

    set(val: LightState[]) {
        const jState = JSON.stringify(val);
        if (jState === this.lastState) return;
        this.lastState = jState;

        this.shape.opacity.curAnim?.stop();
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        if (val.length) {
            const setShape = (s: LightState) => {
                this.shape.opacity.curAnim?.stop();
                this.shape.opacity(1);
                const state = normalizeLight(s);
                this.shape.fill(colorToHex(state.color)!);
                switch (state.type) {
                    case 'flashing':
                    case 'pulsing':
                        this.shape.opacity.anim({
                            autoreverse: true,
                            duration: 1000/state.freq / 2,
                            from: 1-state.phase,
                            to: state.phase,
                            loop: -1,

                        }).start();
                        break;
                    case 'solid':
                        break;
                }
            };
            setShape(val[0]);
            if (val.length > 1) {
                let i = 1;
                this.timer = setInterval(() => {
                    setShape(val[i++]);
                    if (i >= val.length)
                        i = 0;
                }, 500);
            }
        } else {
            this.shape.fill('#FFFFFF');
        }
        this.shape.filled(val.length !== 0);
    }
}

class CircleLight extends Light {
    shape!: Circle;

    constructor(
        name: keyof LightOutputs,
    ) {
        super(name);
        const {d} = gfxLights[name];
        this.shape = pfx!.createCircle().radius(d!/2).opacity(1);
        this.add(this.shape);
        this.set([]);
    }
}
class ArrowLight extends Light {

    constructor(
        name: keyof LightOutputs,
    ) {
        super(name);
        const {a, r} = gfxLights[name];
        this.shape = pfx!.createPolygon();
        const points = new Float32Array(6);
        points[0] = 0;
        points[1] = a!/3*2;

        points[2] = a!/4;
        points[3] = -a!/3;

        points[4] = -a!/4;
        points[5] = -a!/3;

        this.shape.geometry(points);
        this.shape.rz(r!);
        this.add(this.shape);
        this.set([]);
    }
}

export class Display extends Group {
    image!: Image;
    node?: Node;
    setttings!: DisplaySettings;

    static zoomed?: Display;

    constructor(public name: keyof ImageOutputs) {
        super(pfx!);
        this.setttings = gfxImages[name];
        this.resetPos();

        this.add(pfx!.createRect().w(this.w()).h(this.h()).fill('#000000').z(-1));

        this.image = new Image(pfx!);
        this.image.w(80);
        this.image.h(120);
        this.image.top(1).bottom(0).size('stretch');
        this.add(this.image);

        this.acceptsMouseEvents = true;
        pfx!.on('press', this, (e) => {
            console.log('disp %s clicked', name);
            if (Display.zoomed) {
                Display.zoomed.resetPos();
                Display.zoomed = undefined;
            }
            Display.zoomed = this;
            this.x(Playfield.w*1.1);
            this.y(Playfield.h-10-10);
            // this.w(50);
            // this.h(50*(this.setttings.large? 160:128)/128);
            this.rz(0);
            this.sx(1/7);
            this.sy(1/7);
        });
    }

    resetPos() {
        const {x,y,r, large} = this.setttings;
        this.x(x);
        this.y(y);
        this.rz(r ?? 0);
        this.w(large? 200:128);
        this.h(128);
        this.originX(0);
        this.originY(0);
        this.sx(1/80).sy(1/80);
    }

    set(val: ImageType) {
        if (this.node) {
            this.remove(this.node);
            this.node = undefined;
        }
        if (!val) return;
        if ('hash' in val) {
            this.image.visible(false);
            const g = this.node = pfx!.createGroup();
            if ('color' in val) {
                g.add(pfx!.createRect().fill(colorToHex(val.color!)!).w(this.w()).h(this.h()));
            }
            for (const i of val.images ?? []) {
                // g.add(makeImage(val.image!, 80, 160, undefined, pfx!));
                const img = pfx!.createImageView().w(this.w()).h(this.h());
                img.size('stretch');
                img.src(`cdisp/media/${this.setttings.large? '160':'128'}/${i}.png`);
                img.top(1).bottom(0);
                g.add(img);
            }
            if ('text' in val) {
                for (const {text, x, y, size, vAlign} of val.text!) {
                    const t = makeText(text, size, 'left', vAlign!=='center'? vAlign : 'middle', pfx!);
                    g.add(t.rz(0).x(x).y(this.h()-y).sy(-1).originY(0));
                }
            }
            this.add(this.node!);
        } else {
            debugger;
        }
    }
}

export class Image extends ImageView {
    curVal?: string;
    targetVal?: string;

    set(val: string): void {
        this.targetVal = val;
        const image = this;
        image?.visible(val.length > 0);

        if (val.length > 0) {
            const cache = Image.getCache(this.amino);
            if (cache[val]) {
                if ('then' in cache[val]) {
                    debugger;
                } else {
                    Log.trace('gfx', 'use cached image for "%s"', val);
                    image?.image(cache[val]);
                    this.curVal = val;
                }
            }
            else {
                debugger;
            }
        } else {
            this.curVal = val;
        }
        return undefined;
    }

    static async cacheTexture(val: string): Promise<any> {
        Log.info('gfx', 'new image load for %s', val);
        const img = await Image.loadImage(val);
        await Promise.all([gfx, pfx].truthy().map(g => new Promise((resolve, reject) => {
            const texture = g.createTexture();
            texture.loadTextureFromImage(img, (err) => {
                if (err) {
                    Log.error('gfx', 'error loading image "%s": ', val, err);
                    // debugger;
                    reject(err);
                    return;
                }
                Image.getCache(g)[val] = texture;
                resolve(texture);
            });
        })));
    }

    static loadImage(val: string): Promise<AminoImage> {
        Log.info('gfx', 'new image load for %s', val);
        return new Promise((resolve, reject) => {
            const img = new AminoImage();

            img.onload = (err) => {
                if (err) {
                    Log.error('gfx', 'error loading image "%s": ', val, err);
                    // debugger;
                    reject(err);
                    return;
                }

                resolve(img);
                Log.info('gfx', 'image %s loaded', val);
            };

            img.src = 'media/'+val+'.png';
        });
    }

    static getCache(g: any): { [name: string]: Texture } {
        if (!g.cache)
            g.cache = {};
        return g.cache;
    }
}

class FxSwitch extends Rect {
    constructor(
        public sw: Switch,
    ) {
        super(pfx!);
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

        pfx!.on('press', this, (e) => {
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
        super(pfx!);
        assert(coil);

        this.originX(0.5).originY(0.5);
        this.w(0.5).h(0.5);
        this.rz(45);

        const {x,y} = gfxCoils[coil.name];
        this.x(x).y(y);

        this.fill(coil.actual? '#ff0000' : '#ffffff');
        Events.listen(() => {
            this.fill(coil.actual? '#ff0000' : (coil.val? '#ff6600' : '#fffff'));
        }, onChange(coil, ['actual', 'val']));
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

export function makeImage(name: string, w: number, h: number, flip = true, g = gfx): Image {
    const img = new Image(g).opacity(1.0).w(w).h(h);
    if (flip) img.top(1).bottom(0);
    img.size('stretch');
    img.set(name);
    return img;
}

export class ModeGroup extends Group {
    listener!: EventListener;

    constructor(
        public mode: Mode,
    ) {
        super(gfx);

        this.listener = Events.listen(() => this.visible(machine.getChildren().includes(mode)), e => e instanceof TreeChangeEvent);
        Events.listen(() => {
            this.parent?.remove(this);
            Events.cancel(this.listener);
            return 'remove';
        }, mode.onEnd());
    }
}

export function addToScreen(cb: () => ModeGroup) {
    if (!screen) return;
    const node = cb();
    node.mode.gfx = node;

    const modes = screen.children.filter(n => n instanceof ModeGroup) as ModeGroup[];
    if (modes.length === 0) {
        screen.add(node);
        return;
    }

    for (const mode of modes) {
        if (mode.mode.gPriority >= node.mode.gPriority) {
            screen.insertBefore(node, mode);
            return;
        }
    }
    screen.add(node);
}

export function makeText<T extends Color|undefined = undefined>(text: string, height: number,
    align: 'corner'|'center'|'left'|'right' = 'center',
    vAlign: 'baseline'|'top'|'middle'|'bottom'|undefined = undefined,
    g = gfx,
    colorSwatch?: T | (() => T),
): T extends Color? Group : Text {
    const t = g.createText().fontName('card').sy(1).sx(1).text(text).fontSize(height)
        .align(align === 'corner' ? 'left' : align)
        .vAlign(align === 'corner' ? 'top' : (vAlign !== undefined ? vAlign : 'middle'));
    if (colorSwatch) {
        const group = g.createGroup();
        group.add(t);
        const r = g.createRect().fill(colorToHex(typeof colorSwatch==='function'? colorSwatch()! : colorSwatch!)!);
        r.h(height*.8);
        r.y(-height*.05);
        r.w(height*.5);
        const padding = text.startsWith(':')? 0 : height*.15;
        r.originX(0).originY(vAlign==='middle'? 0.5 : (vAlign==='bottom'? .97 : 0));
        t.lineW.watch(w => {
            r.x((align==='center'? -w/2 : (align === 'right'? -w : 0))-padding);
            group.w(r.w() + w + padding);
        }, true);
        t.x(r.w() + padding);
        group.add(r);
        return group as any;
    } else {
        return t as any;
    }
}

export const gfxLights: { [name in keyof LightOutputs]: {
    x: number;
    y: number;
    l?: Light;
}&({
    d: number;
    a?: undefined;
    r?: undefined;
}|{
    d?: undefined;
    a: number;
    r: number;
})} = {
    lMiniReady: { x: 2.53125, y: 11.25, d: 5/8 },
    lRampArrow:  { x: 4.10625, y: 27.95625, a: 1.5, r: 20 },
    lPower1: { x: 7.199999999999999, y: 10.575000000000003, d: 5/8 },
    lPower2: { x: 8.4375, y: 10.181249999999999, d: 5/8 },
    lPower3: { x: 9.9, y: 10.125, d: 5/8 },
    lPopperStatus:  { x: 16.03125, y: 9.5625, d: 3/4 },
    lLaneUpper1: { x: 11.081249999999999, y: 43.0, d: 1 },
    lLaneUpper2: { x: 12.993749999999999, y: 43, d: 1 },
    lLaneUpper3: { x: 14.5375, y: 43, d: 1 },
    lLaneUpper4: { x: 16.2375, y: 43, d: 1 },
    lSideShotArrow:  { x: 5.90625, y: 32.85, a: 1.5, r: 40 },
    lEjectArrow:  { x: 8.6625, y: 35.24375, a: 1.5, r: -5 },
    lUpperLaneArrow:  { x: 12.2625, y: 36.3375, a: 1.5, r: -45 },
    lUpperTargetArrow:  { x: 15.1875, y: 36.50625, a: 1, r: -45 },
    lSpinnerArrow:  { x: 15.862499999999999, y: 31.78125, a: 1.5, r: -25 },
    lLeftArrow:  { x: 2.025, y: 27.225, a: 1, r: 20 },
    lSideTargetArrow:  { x: 8.268749999999999, y: 30.31875, a: 1, r: 90 },
    lRampMini: { x: 2.9812499999999997, y: 27.337500000000002, d: 5/8 },
    lMainTargetArrow:  { x: 6.69375, y: 27.675, a: 1, r: 27 },
    lSpinnerTarget: { x: 15.075, y: 33.35625, d: 5/8 },
    lUpperLaneTarget: { x: 13.21875, y: 36.1125, d: 5/8 },
    lMagnet3: { x: 4.33125, y: 19.293750000000003, d: 5/8 },
    lMagnet2: { x: 4.35875, y: 18.39375, d: 5/8 },
    lMagnet1: { x: 4.05, y: 17.6625, d: 5/8 },
    lShootAgain: { x: 9.05625, y: 5.399999999999999, d: 1 },
    lLaneLower1: { x: 1.0687499999999999, y: 17.212500000000002, d: 5/8 },
    lLaneLower2: { x: 2.64375, y: 16.875, d: 5/8 },
    lLaneLower3: { x: 15.581249999999999, y: 16.481250000000003, d: 5/8 },
    lLaneLower4: { x: 17.15625, y: 16.59375, d: 5/8 },
};

type DisplaySettings = {
    x: number;
    y: number;
    r?: number;
    l?: Display;
    large?: boolean;
};
export const gfxImages: { [name in keyof ImageOutputs]: DisplaySettings} = {
    iCenter1: { x: 9.5, y: 23.65, r: -17 },
    iCenter2: { x: 10.7, y: 23.35, r: -17 },
    iCenter3: { x: 12.0, y: 22.95, r: -17 },
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
    iUpper31: { x: 9.8, y: 38.9, r: -42, },
    iUpper32: { x: 10.5, y: 38.1, r: -42 },
    iUpper33: { x: 11.5, y: 37.3, r: -42 },
    iSS1: { x: 18.5, y: 20.5125, r: 90, large: true },
    iSS3: { x: 17.912499999999998, y: 37.35, r: 0 },
    iSS4: { x: 16.875, y: 42.01875, r: 0, large: true },
    iSS5: { x: 6.4125, y: 42.525, r: 0, large: true },
    iSS6: { x: 1.8999999999999999, y: 25.875, r: 0 },
    iSpinner: { x: 15.35625, y: 30.0375, r: 0-20, large: true },
    iRamp: { x: 5.6812499999999995, y: 25.650000000000002, r: 20+0, large: true },
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
    'catcher': { x: 17.381249999999998, y: 36.5625 },
    // 'magnetPost': { x: 18.61875, y: 34.65 },
    'upper3': { x: 11.75625, y: 39.09375 },
    'upper2': { x: 6.637499999999999, y: 39.88125 },
    'popper': { x: 14.174999999999999, y: 7.481250000000003 },
    'leftMagnet': { x: 2.475, y: 18.675 },
    'outhole': { x: 8.4375, y: 1.96875 },
    'troughRelease': { x: 16.3125, y: 2.0249999999999986 },
    'miniEject': { x: 6.1875, y: 2.3625000000000043 },
    'upperEject': { x: 5.0625, y: 40.5 },
    'miniFlipperEnable': { x: 3.15, y: 3.65625 },
    'kickerEnable': { x: 9.112499999999999, y: 6.918750000000003 },
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
    'upper lane 2':  { x: 12.993749999999999, y: 41.5125 },
    'upper lane 3':  { x: 14.34375, y: 41.34375 },
    'upper lane 4':  { x: 15.4375, y: 41.31875 },
    'upper eject':  { x: 4.78125, y: 39.375 },
    'left inlane':  { x: 1.18125, y: 15.693750000000001 },
    'spinner': { x: 17.662499999999998, y: 33.35625 },
    'under ramp': { x: 2.4187499999999997, y: 34.25625 },
    'left orbit': { x: 1.0125, y: 39.76875 },
    'left outlane': { x: 2.5875, y: 15.1875 },
    'right outlane': { x: 16.9875, y: 14.681250000000002 },
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
    'left flipper': { x: 0.39375, y: 1.3187500000000014 },
    'right flipper': { x: 18.95625, y: 1.387500000000003 },
    'both flippers': { x: 9.674999999999999, y: 0.3374999999999986 },
    'tilt': { x: 18, y: 3.0375000000000014 },
    'right sling': { x: 13.725, y: 13.668750000000003 },
    'left sling': { x: 4.44375, y: 13.5 },
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


export async function gWait(ms: number, context: string) {
    if (machine.sBothFlippers.state) return;
    await Promise.race([
        wait(ms, context),
        // machine.await(onSwitchClose(machine.sBothFlippers)),
    ]);
}

const popups: Node[] = [];
export async function popup(node: Node, ms = 3500, hidePrevious = false) {
    // if (!pfx) return;
    // node.x(Screen.w/2);
    // node.y(Screen.h/2);
    if (gfx) {
        node.z(100);
        screen.add(node);
        if (hidePrevious)
            popups.forEach(n => n.visible(false));
    }
    popups.push(node);
    if (ms)
        await gWait(ms, 'popup');
    if (gfx && ms) screen.remove(node);
    popups.remove(node);
    return;
}


export function alert(text: string, ms?: number, subtext?: string): [Group, Promise<void>] {
    let g: Group;
    if (gfx) {
        Log.log(['gfx', 'console'], 'alert message %s / %s', text, subtext);
        g = gfx.createGroup().y(-Screen.h * .32);
        const t = makeText(text, 70, 'center', 'top').wrap('word').w(Screen.w *.6).x(-Screen.w*0.6/2);
        const t2 = subtext? makeText(subtext, 40, 'center', 'top').wrap('word').w(t.w()).x(t.x()) : undefined;

        // g.add(pfx.createRect().x(t.x()).w(t.w()).h(50).fill('#ff0000').z(-2));
        const r = gfx.createRect().fill('#555555').z(-.1).y(-20);
        function setW() {
            r.w(Math.max(t.lineW(), t2?.lineW() ?? 0)+40);
            r.x((t.w()-r.w())/2 + t.x());
        }
        t.lineW.watch(setW);
        t2?.lineW.watch(setW);
        setW();
        function setH() {
            r.h(t.lineNr()*t.fontSize()+(t2?.lineNr()??0)*(t2?.fontSize()??0)+40);
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

    return [g, popup(g, ms, true)]; 
}

export function notify(text: string, ms = 2000): [Group, Promise<void>] {
    let g: Group;
    if (gfx) {
        Log.log(['gfx', 'console'], 'notify message %s / %s', text);
        g = gfx.createGroup().y(Screen.h/2);
        const t = makeText(text, 50, 'center', 'bottom').w(Screen.w).x(-Screen.w/2).y(-10);
        const r = gfx.createRect().fill('#444444').z(-.1);
        function setW() {
            r.w(t.lineW()+50);
            r.x((t.w()-r.w())/2 + t.x());
        }
        t.lineW.watch(setW);
        setW();
        function setH() {
            r.h(t.lineNr()*t.fontSize()*1.25);
            r.y(-r.h());
        }
        t.lineNr.watch(setH);
        setH();
        g.add(r, t);
    } else {
        g = new FakeGroup() as any;
    }

    return [g, popup(g, ms)]; 
}

export function textBox(settings: {maxWidth?: number; padding?: number; bgColor?: Color}, 
    ...lines: [text: string, size: number, spacing?: number, swatch?: Color][]
): Group {
    let g: Group;
    const maxWidth = settings.maxWidth ?? 0.6;
    const padding = settings.padding ?? 30;
    const bgColor = settings.bgColor? colorToHex(settings.bgColor)! : '#555555'; 
    if (gfx) {
        g = gfx.createGroup().y(-Screen.h * .2).originX(0).originY(0);

        const r = gfx.createRect().fill(bgColor).z(-.1).w(Screen.w/2).h(Screen.h/2).originX(0.5);
        g.add(r);

        const texts = lines.map(([text, size, _, swatch]) => {
            const group = makeText(text, size, 'center', 'top', gfx, swatch);
            const t = (swatch? group.children[0] : group) as Text;
            t.wrap('word').w(Screen.w*maxWidth).x(-Screen.w*maxWidth/2);
            g.add(group);
            return t;
        });


        function setW() {
            r.w(texts.map(t => t.lineW()).reduce((a,b) => Math.max(a,b), 0) + padding * 2);
            g.w(r.w());
        }
        texts.forEach(t => t.lineW.watch(setW));
        setW();
        function setH() {
            let y = 0;
            let i = 0;
            for (const t of texts) {
                t.y(y);
                y += t.lineNr()*t.fontSize();
                y += lines[i++][2] ?? 0.1;
            }
            r.y(-padding);
            r.h(y + padding * 2);
            g.y(-y/2);
        }
        texts.forEach(t => t.lineNr.watch(setH));
        setH();
    } else {
        g = new FakeGroup() as any;
    }

    return g;
}

export function leftAlign(...lines: (Text|Group)[]): Group {
    const group = gfx.createGroup().originX(0.5).originY(0);
    function wChanged() {
        const maxW = Math.max(...lines.map(l => l instanceof Text? l.lineW() : l.w()));
        group.w(maxW);
    }
    for (const line of lines) {
        group.add(line);
        if (line instanceof Text)
            line.lineW.watch(wChanged);
        else
            line.w.watch(wChanged);
    }
    wChanged();
    // group.add(gfx.createCircle().fill('#00FF00').radius(4));
    return group;
}