import { AminoGfx, Property, Group, Circle, ImageView } from 'aminogfx-gl';
import { Log } from './log';
import { initMachine } from './init';
import { LightOutputs } from './machine';
import { Color, colorToHex } from './light';

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
            this.fill(colorToHex(val[0]));
        } else {
            this.fill('#FFFFFF');
        }
        this.filled(val.length !== 0);
    }
}

if (require.main === module) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    // initMachine().then(() => initGfx());
    Log.init();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    initGfx();
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