import { Group } from 'aminogfx-gl';
import { argv } from 'yargs';
import { dImage, dInvert, dMany } from './disp';
import { Game } from './game';
import { addToScreen, gfx, makeText, ModeGroup, Screen } from './gfx';
import { getHighscores, Highscores } from './highscore';
import { initMachine } from './init';
import { Color } from './light';
import { Log } from './log';
import { machine } from './machine';
import { Mode, Modes } from './mode';
import { Outputs } from './outputs';
import { fork } from './promises';
import { State } from './state';
import { onSwitchClose } from './switch-matrix';
import { Time, time } from './timer';
import { money, round, roundDown, score, wrap } from './util';
import { ClearHoles } from './util-modes';

export class AttractMode extends Mode {

    clearHoles = new ClearHoles();

    override get nodes() {
        return [this.clearHoles];
    }

    start = time();

    constructor(
        public scores?: [number, number][],
    ) {
        super(Modes.AttractMode);
        State.declare<AttractMode>(this, ['start']);

        this.out = new Outputs(this, {
            lPower1: [[Color.White, 'fl', 1, 1]],
            lPower2: [[Color.White, 'fl', 1, 0]],
            lPower3: [[Color.White, 'fl', 1, 1]],
            lLaneLower1: [[Color.Yellow, 'fl', 1, 1]],
            lLaneLower2: [[Color.Yellow, 'fl', 1, 0]],
            lLaneLower3: [[Color.Yellow, 'fl', 1, 1]],
            lLaneLower4: [[Color.Yellow, 'fl', 1, 0]],
            lMagnet1: [[Color.Green, 'fl', 1, 1]],
            lMagnet2: [[Color.Green, 'fl', 1, 0]],
            lMagnet3: [[Color.Green, 'fl', 1, 1]],
            lShootAgain: [[Color.Purple, 'fl', 1, 1]],
            lPopperStatus: [[Color.Green, 'fl', 1, 0]],
            lRampArrow: [[Color.Blue, 'fl', 1, 0]],
            lMainTargetArrow: [[Color.Pink, 'fl', 1, 1]],
            lRampMini: [[Color.Orange, 'fl', 1, 1]],
            lLeftArrow: [[Color.Orange, 'fl', 1, 0]],
            lSideShotArrow: [[Color.White, 'fl', 1, 1]],
            lSideTargetArrow: [[Color.Red, 'fl', 1, 0]],
            lEjectArrow: [[Color.Yellow, 'fl', 1, 0]],
            lUpperLaneArrow: [[Color.Red, 'fl', 1, 1]],
            lUpperLaneTarget: [[Color.Orange, 'fl', 1, 0]],
            lUpperTargetArrow: [[Color.White, 'fl', 1, 1]],
            lSpinnerArrow: [[Color.Blue, 'fl', 1, 1]],
            lSpinnerTarget: [[Color.Orange, 'fl', 1, 0]],
            lLaneUpper1: [[Color.Orange, 'fl', 1, 0]],
            lLaneUpper2: [[Color.Orange, 'fl', 1, 1]],
            lLaneUpper3: [[Color.Orange, 'fl', 1, 0]],
            lLaneUpper4: [[Color.Orange, 'fl', 1, 1]],                        
            lStraightStatus: [[Color.Blue, 'fl', 1, 0]],
            lFlushStatus: [[Color.Pink, 'fl', 1, 1]],     
            lFullHouseStatus: [[Color.Yellow, 'fl', 1, 0]],                   
            lMiniBank: [[Color.Yellow, 'fl', 1, 0]],
            lMiniReady: [[Color.Green, 'fl', 1, 1]],      
            shooterDiverter: () => machine.sShooterLane.state || (machine.lastSwitchHit && machine.lastSwitchHit?.lastChange < machine.sShooterLane.lastChange),          
        });

        addToScreen(() => new AttractGfx(this));

        this.listen(onSwitchClose(machine.sStartButton), async () => {
            const game = await Game.start(argv.seed as string ?? Math.random().toString());
        });
    }

    override end() {
        machine.attract = undefined;
        return super.end();
    }

    static start() {
        Log.log(['console'], 'starting attract mode...');
        machine.attract = new AttractMode();
        machine.attract.started();
    }
}

if (require.main === module) {
fork(initMachine(true, true, false, false)).then(() => {
    
});
}

export class AttractGfx extends ModeGroup {
    constructor(
        public a: AttractMode,
    ) {
        super(a);
        this.z(a.gPriority);

        const slides: Group[] = [];

        const scores = gfx.createGroup();
        if (!a.scores)
            scores.add(makeText('Attract Mode', 100, 'center'));
        else {
            scores.add(makeText('Game Over', 100, 'center').y(-Screen.h*.35));
            let y = -Screen.h * .15;
            let i = 1;
            for (const [sc, bank] of a.scores) {
                scores.add(makeText(`PLAYER ${i}:`, 50, 'left').x(-Screen.w*.4).y(y));
                scores.add(makeText(`${score(sc)}  |  ${money(bank)}`, 50, 'right').x(Screen.w*.4).y(y));
                y += 75;
                i++;
            }
        }
        slides.push(scores);

        const highscores = getHighscores();
        let partialSlide: Group|undefined = undefined;
        let partialI = 1;
        let partialY = 0;
        for (const type of Object.keys(highscores) as (keyof Highscores)[]) {
            if (highscores[type].length > 1) {
                let y = -Screen.h * .15;
                let i = 1;
                const slide = gfx.createGroup();
                slide.add(makeText(type, 100, 'center').y(-Screen.h*.35));
                for (const {name, score} of highscores[type].slice(0, 4)) {
                    slide.add(makeText(`${i}: ${name}`, 50, 'left').x(-Screen.w*.4).y(y));
                    slide.add(makeText(score, 50, 'right').x(Screen.w*.4).y(y));
                    y += 75;
                    i++;
                }
                slides.push(slide);
            }
            else {
                let y = -Screen.h * .41;
                let i = 1;
                let slide!: Group;
                if (partialSlide) {
                    y = partialY;
                    i = partialI;
                    slide = partialSlide;
                }
                else
                    partialSlide = slide = gfx.createGroup();
                slide.add(makeText(type, 60, 'center').y(y));
            y += 0.1 * Screen.h+25;
                const {name, score} = highscores[type][0];
                slide.add(makeText(`${name}`, 50, 'left').x(-Screen.w*.3).y(y));
                slide.add(makeText(score, 50, 'right').x(Screen.w*.3).y(y));
                y += 110;

                i++;
                if (i > 3) {
                    slides.push(slide);
                    partialSlide = undefined;
                }
                else {
                    partialY = y;
                    partialI = i;
                }
            }
        }
        if (partialSlide)
            slides.push(partialSlide);

        for (const slide of slides)
            this.add(slide);
        a.watch(() => {
            slides.forEach((slide, i) => 
                slide.visible(wrap(((time()-a.start)/4000)|0, slides.length) === i),
            );
        });
        a.listen(onSwitchClose(machine.sRightFlipper), () => a.start = (a.start-4000) as any);
        a.listen(onSwitchClose(machine.sLeftFlipper), () => a.start = (a.start+4000) as any);
    }
}