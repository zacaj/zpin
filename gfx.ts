import { AminoGfx, Property, Group, Circle, ImageView, Rect } from 'aminogfx-gl';
import { Log } from './log';
import { initMachine } from './init';
import { LightOutputs, ImageOutputs, resetMachine } from './machine';
import { Color, colorToHex } from './light';
import { Switch, onSwitchClose, onSwitch, matrix, getSwitchByName, resetSwitchMatrix } from './switch-matrix';
import { Events } from './events';
import { assert } from './util';
import { Game } from './game';

let gfx: AminoGfx;
let screenW: number;
let screenH: number;
let root: Group;
let playfield: Playfield;
let screen: Screen;

export async function initGfx() {
    gfx = await new Promise((resolve, reject) => {
        const g = new AminoGfx();
        g.start((err) => {
            if (err) reject(err);
            else resolve(g);
        });
    });
    Log.info('gfx', 'amino initialized');

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

    playfield = new Playfield();
    root.add(playfield);

    screen = new Screen();
    playfield.add(screen);
    screen.x(5.5);
    screen.y(22.7);

    playfield.acceptsMouseEvents = true;
    gfx.on('press', playfield, (e) => {
        console.log('playfield location: ', e.point);
    });

    Log.log('gfx', 'graphics initialized');
}

export class Playfield extends Group {
    static readonly w = 20.25;
    static readonly h = 45;

    bg = makeImage('pf.png', Playfield.w, Playfield.h);

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
        this.originY(1);

        this.add(gfx.createRect().w(Screen.sw).h(Screen.sh).originX(0).originY(0).fill('#000000'));
        
        this.add(gfx.createCircle().radius(10).x(500).y(300));
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

class Image extends ImageView {

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
        if (val.length)
            this.src('media/'+val+'.png');
        this.visible(val.length > 0);
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
    resetSwitchMatrix();
    resetMachine();
    Log.init();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    initGfx();
    const game = Game.start();
}

function makeImage(name: string, w: number, h: number): ImageView {
    const img = gfx.createImageView().opacity(1.0).w(w).h(h);
    img.src('media/'+name).top(1).bottom(0).size('stretch');
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
    iUpper21: { x: 7.95, y: 38.37, r: -157 },
    iUpper22: { x: 6.9, y: 38.0, r: -157 },
    iUpper31: { x: 9.8, y: 38.9, r: -42 },
    iUpper32: { x: 10.5, y: 38.1, r: -42 },
    iUpper33: { x: 11.5, y: 37.3, r: -42 },
    iMini1: { x: 2.5, y: 6.8, r: 153 },
    iMini2: { x: 3.6, y: 6.25, r: 153 },
    iMini3: { x: 4.8, y: 5.78, r: 153 },
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
};