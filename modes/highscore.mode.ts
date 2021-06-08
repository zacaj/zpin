import { Game } from "../game";
import { gfx, makeText, notify, Screen } from "../gfx";
import { GameGfx } from "../gfx/game";
import { Highscores } from "../highscore";
import { light, Color } from "../light";
import { machine, MachineOutputs } from "../machine";
import { Outputs } from "../outputs";
import { playVoice } from "../sound";
import { State } from "../state";
import { onAnySwitchClose, onSwitchClose } from "../switch-matrix";
import { time } from "../timer";
import { Tree } from "../tree";
import { objectMap, score } from "../util";
import { Player } from "./player";

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ< ';

export class HighscoreEntry extends Tree<MachineOutputs> {
    initials: string[] = ['_', '_', '_'];

    constructor(
        public game: Game,
        public player: Player,
        public highs: (keyof Highscores)[],
        public highscores: Highscores,
    ) {
        super();
        State.declare<HighscoreEntry>(this, ['initials']);

        void playVoice('highscore');

        const recents = [
            ...Object.values(highscores).flat().filter(s => s.date && s.name!=='?').sort((a, b) => b.date! > a.date!? 1 : -1).map(s => s.name),
            'RAY',
            'SAG',
            'RON',
            'ZAC',
        ].unique().slice(0, 5);

        const group = gfx.createGroup();
        game.gfx!.add(group);
        group.z(20);

        const bg = gfx.createRect().x(-Screen.w/2).y(-Screen.h/2).w(Screen.w).h(Screen.h).fill('#444444').z(-.1);
        group.add(bg);

        const newScore = makeText('NEW high score', 70, 'center').y(-Screen.h*.4);
        group.add(newScore);
        this.watch(() => newScore.text(`NEW ${highs[(time()/1500%highs.length)|0].replace(/S$/, '')}`));

        group.add(makeText(`PLAYER ${player.number}, ENTER YOUR INITIALS`, 35, 'center').y(Screen.h*-.2));

        group.add(makeText('MAGNET: RECENT', 20, 'left', 'bottom').x(Screen.w*-.5).y(Screen.h*.5));

        let i=0;
        const init = makeText('', 130, 'center').y(Screen.h*.1);
        group.add(init);
        this.watch(() => init.text(this.initials.join(' ')));

        const arrow = makeText('^', 130, 'center').x(Screen.w*-.137).y(Screen.h*.3);
        group.add(arrow);
        arrow.opacity.anim({
            autoreverse: true,
            duration: 500,
            from: 1,
            to: 0,
            loop: -1,
            timeFunc: 'cubicInOut',
        }).start();

        this.listen(onAnySwitchClose(machine.sStartButton, machine.sActionButton), () => {
            if (this.initials[i] === '<') {
                this.initials[i] = '_';
                arrow.x(arrow.x()-Screen.w*.137);
                i--;
                return;
            }
            if (i===2) {
                for (const type of highs) {
                    for (const score of highscores[type]) {
                        if (score.name === '?')
                            score.name = this.initials.join('');
                    }
                }
                this.game.gfx!.remove(group);
                return this.end();
            }
            arrow.x(arrow.x()+Screen.w*.137);
            i++;
        });

        this.listen(onAnySwitchClose(machine.sLeftFlipper, machine.sRightFlipper), e => {
            const ch = i? chars : chars.split('').filter(c => c!=='<').join('');
            let ind = ch.indexOf(this.initials[i]);
            if (ind === -1) ind = ch.length-1;
            if (e.sw === machine.sLeftFlipper) ind--; else ind++;
            if (ind < 0) ind += ch.length;
            if (ind >= ch.length) ind -= ch.length;
            this.initials[i] = ch.charAt(ind);
        });

        this.listen(onAnySwitchClose(machine.sMagnetButton, machine.sPopperButton), e => {
            let ind = recents.indexOf(this.initials.join(''));
            if (ind === -1) ind = recents.length-1;
            if (e.sw === machine.sMagnetButton) ind--; else ind++;
            if (ind < 0) ind += recents.length;
            if (ind >= recents.length) ind -= recents.length;
            this.initials = recents[ind].split('');
            while (i < 2) {
                arrow.x(arrow.x()+Screen.w*.137);
                i++;
            }
        });
    }
}