import { Group, Text } from "aminogfx-gl";
import { dClear, dImage } from "../disp";
import { Events, Priorities } from "../events";
import { Game } from "../game";
import { addToScreen, alert, gfx, makeText, ModeGroup, notify, Screen } from "../gfx";
import { GameGfx } from "../gfx/game";
import { Highscores } from "../highscore";
import { light, Color } from "../light";
import { machine, MachineOutputs } from "../machine";
import { Mode, Modes } from "../mode";
import { Outputs } from "../outputs";
import { fork } from "../promises";
import { muteMusic, playSound, playVoice, unmuteMusic } from "../sound";
import { State } from "../state";
import { onAnyPfSwitchExcept, onAnySwitchClose, onSwitchClose } from "../switch-matrix";
import { time, Timer, TimerQueueEntry, wait } from "../timer";
import { Tree } from "../tree";
import { money, round, score } from "../util";
import { Effect, FireCoil, ResetBank } from "../util-modes";
import { Multiplier, Player } from "./player";

export enum MysteryNext {
    Lane = 'lane',
    Shot = 'shot',
    Sling = 'sling',
    Standup = 'standup',
    Target = 'target',
}

type Award = {
    name: string | ((player: Player) => string);
    giveAward: (player: Player) => void;
    isValid?: (player: Player) => boolean;
    chance: number;
};

export type MysteryAward = Award;

const allAwards: Award[] = [
    {
        name(player) {
            return score(Math.min(Math.max(round(player.score * player.mysteryRng.randRange(0.1, 0.25), 10000), 25000), 250000))+' POINTS';
        },
        giveAward(player) {
            player.addScore(Math.min(Math.max(round(player.score * player.mysteryRng.randRange(0.1, 0.25), 10000), 25000), 250000), 'big points', true);
        },
        chance: 10,
    },
    // {
    //     name(player) {
    //         return score(Math.max(round(player.score * player.mysteryRng.randRange(0.04, 0.17), 10000), 25000))+' POINTS';
    //     },
    //     giveAward(player) {
    //         player.addScore(Math.max(round(player.score * player.mysteryRng.randRange(0.04, 0.17), 10000), 25000), 'big points', true);
    //     },
    //     chance: 10,
    // },
    {
        name: 'BIG POINTS',
        giveAward(player) {
            player.addScore(10000, 'big points', true);
        },
        chance: 3,
    },
    {
        name: 'LIGHT MUTLIBALL',
        giveAward(player) {
            const mb = player.mysteryRng.randSelect(...['StraightMb', 'FullHouseMb', 'FlushMb'].filter(m => !player.mbsQualified.has(m as any)) as any)
            player.qualifyMb(mb);
        },
        chance: 8,
        isValid(player) {
            return player.mbsQualified.size <= 1;
        },
    },
    {
        name: '$500',
        giveAward(player) {
            player.store.Poker!.bank += 500;
            alert('+ $500');
        },
        chance: 6,
    },
    {
        name: 'LOSE $250',
        giveAward(player) {
            player.store.Poker!.bank -= 250;
            alert('- $250');
        },
        chance: 6,
    },
    {
        name: '$ VALUE +50',
        giveAward(player) {
            player.changeValue(50);
        },
        chance: 6,
    },
    {
        name: '$ VALUE -25',
        giveAward(player) {
            player.changeValue(-25);
        },
        chance: 6,
    },
    {
        name: 'BONUS X + 2',
        giveAward(player) {
            player.ball!.bonusX+=2;
            alert(`bonus ${player.ball!.bonusX}X`);
        },
        chance: 6,
    },
    {
        name(player) {
            return 'lose '+score(Math.max(round(player.score * player.mysteryRng.randRange(0.01, 0.1), 10000), 5000))+' POINTS';
        },
        giveAward(player) {
            player.addScore(-Math.max(round(player.score * player.mysteryRng.randRange(0.01, 0.1), 10000), 5000), 'lose points', true);
        },
        chance: 6,
    },
    {
        name: '2X scoring',
        giveAward(player) {
            player.mult = new Multiplier(player);
            player.mult.started();
        },
        isValid(player) {
            return !player.mult;
        },
        chance: 3,
    },
    {
        name: 'MAX cheats',
        giveAward(player) {
            player.chips = 3;
            alert('CHEATS filled');
        },
        chance: 4,
    },
    // {
    //     name: 'NOTHING!',
    //     giveAward(player) {
    //     },
    //     chance: 4,
    // },
    {
        name(player) {
            return `CASH OUT ${money(Math.max(round(player.store.Poker!.bank * (((player.store.Poker!.bank/1000)|0)%4%2+1)*.15, 100), 500))} at 2X`;
        },
        giveAward(player) {
            const value = Math.max(round(player.store.Poker!.bank * (((player.store.Poker!.bank/1000)|0)%4%2+1)*.15, 100), 500);
            player.store.Poker!.bank -= value;
            player.addScore(value*player.store.Poker!.cashValue*2, 'cash out', true);
        },
        chance: 2,
    },
];
export function getMysteryAwards(player: Player) {
    const awards = [...allAwards].shuffle(() => player.mysteryRng.rand());
    return awards;
}

export class Mystery extends Mode {
    awards: Award[] = [];
    timer!: TimerQueueEntry;
    done = false;

    private constructor(
        public player: Player,
    ) {
        super(Modes.Mystery);
        State.declare<Mystery>(this, ['awards', 'done']);
        const startTime = time();
        if (machine.upper3Bank.targets.some(t => t.state))
            fork(ResetBank(this, machine.upper3Bank));

        void playVoice('mystery');
        void muteMusic();
        fork(wait(1000).then(() => void playVoice(['shoot carefully', 'plunge carefully', 'choose wisely'])));

        // const validAwards = allAwards.filter(a => !a.isValid || a.isValid(player));
        const chosenAwards: Award[] = [];
        for (let i=0; i<3; i++) {
            if (!player.mysteryAwards.length)
                player.mysteryAwards = getMysteryAwards(player);
            chosenAwards.push(player.mysteryAwards.pop()!);
        //     chosenAwards.push(player.mysteryRng.weightedSelect(...
        //         validAwards.filter(a => !chosenAwards.includes(a))
        //             .map<[number, Award]>(a => [a.chance, a]),
        //     ));
        }
        chosenAwards.forEach(a => a.name = typeof a.name==='function'? a.name(player) : a.name);
        
        const outs: any  = {};
        for (const target of machine.dropTargets) {
            if (!target.image) continue;
            outs[target.image.name] = dClear(Color.Black);
        }
        for (const light of machine.lights) {
            outs[light.name] = [];
        }
        this.out = new Outputs(this, {
            ...outs,
            iUpper31: () => this.awards.length>=1? dImage('mystery_1') : ((time()/500%2)|0)===0? dImage('mystery_q') : dClear(Color.Black),
            iUpper32: () => this.awards.length>=2? dImage('mystery_2') : ((time()/500%2)|0)!==0? dImage('mystery_q') : dClear(Color.Black),
            iUpper33: () => this.awards.length>=3? dImage('mystery_3') : ((time()/500%2)|0)===0? dImage('mystery_q') : dClear(Color.Black),
            upperEject: () => this.done && machine.sUpperEject.state,
        });

        this.listen([...onAnyPfSwitchExcept(...machine.upper3Bank.targets.map(t => t.switch), machine.sUpperEject), () => time()-startTime>10000], 'end');

        this.listen(machine.upper3Bank.onTargetDown(), e => {
            const i = e.target.bank.targets.indexOf(e.target);
            const award = this.awards[i];
            award.giveAward(player);
            fork(Effect(player.overrides, 1000, {
                iUpper31: () => i === 0? dImage('mystery_1') : dClear(Color.Black),
                iUpper32: () => i === 1? dImage('mystery_2') : dClear(Color.Black),
                iUpper33: () => i === 2? dImage('mystery_3') : dClear(Color.Black),
            }));
            return this.end();
        });

        addToScreen(() => new MysteryGfx(this));

        this.timer = Timer.setInterval(() => {
            if (this.awards.length < 3) {
                void playSound('countdown');
                this.awards.push(chosenAwards.pop()!);
            }
            else {
                void playSound('countdown end');
                Timer.cancel(this.timer);
                this.done = true;
            }
        }, 1750, 'mystery', 3000);
    }

    static async start(player: Player): Promise<Mystery|false> {
        const finish = await Events.tryPriority(Priorities.Mystery);

        if (!finish) return false;

        if (!player.curMbMode && !player.mystery && player.mysteryLeft === 0) {
            const mystery = new Mystery(player);
            player.mystery = mystery;
            finish();
            return mystery;
        } else {
            finish();
            return false;
        }
    }

    end() {
        Timer.cancel(this.timer);
        this.player.mystery = undefined;
        this.player.mysteryLeft = this.player.mysteryRng.randRange(4, 7);
        void unmuteMusic();
        return super.end();
    }
}

class MysteryGfx extends ModeGroup {
    constructor(
        public m: Mystery,
    ) {
        super(m);

        this.z(m.gPriority);

        const bg = gfx.createRect().x(-Screen.w/2).y(-Screen.h/2).w(Screen.w).h(Screen.h).fill('#444444').z(-.1);
        this.add(bg);

        const title = makeText('MYSTERY', 70, 'center').y(-Screen.h*.4);
        this.add(title);

        this.add(makeText(`SHOOT DROP TARGET TO CHOOSE AWARD:`, 50, 'center').y(Screen.h*-.25));

        const awards = [
            makeText('', 80, 'left', undefined, gfx, Color.Orange).x(Screen.w*-.45).y(Screen.h*-.1),
            makeText('', 80, 'left', undefined, gfx, Color.Green).x(Screen.w*-.45).y(Screen.h*.1),
            makeText('', 80, 'left', undefined, gfx, Color.Pink).x(Screen.w*-.45).y(Screen.h*.3),
        ];
        awards.forEach(a => this.add(a));

        m.watch(() => awards.forEach((a, i) => {
            const text = (i+1)+':   '+((m.awards[i]?.name as string)??'');
            (a.children[0] as Text).text(text).fontSize(text.length > 17? 55 : 80);
            a.visible(m.awards.length >= i+1);
        }));
    }
}