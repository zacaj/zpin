import { AminoGfx, Property, Group } from 'aminogfx-gl';
import { Log } from './log';
import { initMachine } from './init';

let gfx: AminoGfx;
let screenW: number;
let screenH: number;
let root: Group;
let playfield: Playfield;

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
        // gfx.w(360);
        // gfx.h(640);
        gfx.h(360);
        gfx.w(640);
        screenW = 360;
        screenH = 640;
    }
    if (gfx.w() > gfx.h()) {
        root.rz(90);
    }

    root.add(gfx.createCircle().radius(10));

    playfield = new Playfield();
    root.add(playfield);

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