import { Group, ImageView } from 'aminogfx-gl';
import { Poker, Card, getFileForCard } from '../modes/poker';
import { gfx, makeImage, Screen, Image, makeText, ModeGroup } from '../gfx';
import { onChange } from '../state';
import { tryNum, comma, score, money } from '../util';
import { machine } from '../machine';
import { onAny } from '../events';
import { Player } from '../modes/player';
import { GameGfx } from './game';
import { Game } from '../game';

export class PlayerGfx extends ModeGroup {
    instr = makeText('START HAND IN SHOOTER LANE', 40, 'center', 'bottom');
    score = makeText('00', 60, 'center', 'top').y(-Screen.h/2);
    bank = makeText('00', 40, 'left', 'top').x(-Screen.w/2).y(-Screen.h/2);
    handsLeft = makeText('', 30, 'left', 'top').x(-Screen.w/2).y(-Screen.h/2+GameGfx.top);

    noMode!: Group;
    pokerOrNo!: Group;

    status = new StatusReportGfx(this.player, this.player.game, this);

    constructor(
        public player: Player,
    ) {
        super(player);
        this.z(player.gPriority);

        this.add(this.noMode = gfx.createGroup());
        player.watch(() => this.noMode.visible(!!player.noMode));
        this.add(this.pokerOrNo = gfx.createGroup());
        player.watch(() => this.pokerOrNo.visible(!!player.noMode || !!player.poker));

        this.noMode.add(this.instr.y(Screen.h*.49));
        player.watch(() => this.instr.visible(!player.curMode));
        player.watch(() => this.instr.text([
            machine.lShooterStartHand.lit()? 'START HAND IN SHOOTER LANE' : undefined,
            machine.lEjectStartMode.lit()? 'START MODE aT EJECT HOLE' : undefined,
            machine.lRampStartMb.lit()? 'START MULTIBALL aT RAMP' : undefined,
        ].filter(x => !!x).join('\n')));

        this.add(this.score);
        player.watch(() => this.score.text(score(player.score)));

        this.pokerOrNo.add(this.bank);
        player.watch(() => this.bank.text(''+money(player.store.Poker?.bank ?? 0)));

        this.pokerOrNo.add(this.handsLeft);
        player.watch(() => {
            const left = player.store.Poker?.handsForMb-player.store.Poker?.handsPlayed;
            this.handsLeft.text(`${left} hand${left>1?'s':''} for MB`);
        });

        this.add(this.status);
    }
}

export class StatusReportGfx extends Group {
    constructor(
        public player: Player,
        public game: Game,
        public g: PlayerGfx,
    ) {
        super(gfx);
        this.z(50);
        this.w(Screen.w*.38);
        this.h(GameGfx.main);
        this.x(-Screen.w/2);
        this.y(-Screen.h/2+GameGfx.top);
        this.add(gfx.createRect().w(this.w()).h(this.h()).fill('#444444').z(-.1));
        const left = 20;
        const right = this.w()-20;
        const bottom = this.h()-20;
        const top = 20;

        this.add(makeText('STATUS REPORT', 50, 'center', 'middle').x(this.w()/2).y(top+15));

        player.watch(() => this.visible(
            Math.max(machine.sLeftFlipper.lastClosed??0,machine.sRightFlipper.lastClosed??0) > (machine.lastSwitchHit?.lastClosed??0)+500
            && 
            (machine.sLeftFlipper.onFor(500) || (machine.sRightFlipper.onFor(500) && !player.ball?.skillshot))
            && !machine.sBothFlippers.state,
        ));

        const stats = gfx.createGroup();
        this.add(stats);
        game.watch(() => {
            const info = [
                [`${player.store.Poker?.handsWon??0} / ${player.store.Poker?.handsPlayed??0} hands won`],
                [`$1 = ${comma(player.store.Poker?.cashValue??0)} points`],
            ];
            stats.clear();
            let y = top + 55;
            for (const i of info) {
                stats.add(makeText(i[0], 35, 'left', 'top').x(left).y(y));
                if (i.length === 2) {
                    // stats.add(makeText(score(game.players[i].score), 35, 'right', 'bottom').x(right).y(y));
                }
                y += 35*1.25;
            }
        });

        const scores = gfx.createGroup();
        this.add(scores);
        game.watch(() => {
            scores.clear();
            if (game.players.length === 1) return;
            let y = bottom;
            for (let i=game.players.length-1; i>=0; i--) {
                scores.add(makeText(`PLAYER ${i+1}:`, 35, 'left', 'bottom').x(left).y(y));
                scores.add(makeText(score(game.players[i].score), 35, 'right', 'bottom').x(right).y(y));
                y -= 35*1.25;
            }
            scores.add(makeText('SCORES:', 40, 'center', 'bottom').x(left).w(this.w()).y(y));
        });
    }
}