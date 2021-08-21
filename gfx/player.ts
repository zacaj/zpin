import { Group, ImageView } from 'aminogfx-gl';
import { Poker, Card, getFileForCard } from '../modes/poker';
import { gfx, makeImage, Screen, Image, makeText, ModeGroup, leftAlign } from '../gfx';
import { onChange } from '../state';
import { tryNum, comma, score, money } from '../util';
import { machine } from '../machine';
import { onAny } from '../events';
import { Difficulty, Player } from '../modes/player';
import { GameGfx } from './game';
import { Game } from '../game';
import { Color } from '../light';
import { time } from '../timer';
import { Modes } from '../mode';

export class PlayerGfx extends ModeGroup {
    instr = makeText('START HAND IN SHOOTER LANE', 40, 'center', 'bottom');
    score = makeText('00', 60, 'center', 'top').y(-Screen.h/2);
    playerNum = makeText('PLAYER 1', 60, 'center', 'top').y(-Screen.h/2);
    bank = makeText('00', 40, 'left', 'top').x(-Screen.w/2).y(-Screen.h/2);
    handsLeft = makeText('', 30, 'left', 'top').x(-Screen.w/2).y(-Screen.h/2+GameGfx.top);
    diff = makeText('MAGNET:\nCHANGE DIFFICULTY', 25, 'left', 'bottom').x(-Screen.w/2).y(Screen.h/2).z(Modes.Poker-Modes.Player+.1).wrap('end').w(Screen.w/2);

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

        // this.noMode.add(this.instr.y(Screen.h*.49));
        // player.watch(() => this.instr.visible(!player.curMode));
        // player.watch(() => this.instr.text([
        //     player.shooterStartHand? 'START HAND IN SHOOTER LANE' : undefined,
        //     // machine.lEjectStartMode.lit()? 'START MODE aT EJECT HOLE' : undefined,
        //     player.mbReady? 'START MULTIBALL aT RAMP' : undefined,
        // ].filter(x => !!x).join('\n')));

        this.noMode.add(leftAlign(
            makeText('START HAND IN SHOOTER LANE', 40, 'left', 'bottom', gfx).y(-Screen.h*.25).visible(player.canStartHand),
            makeText('START MULTIBALL AT RAMP', 40, 'left', 'bottom', gfx).y(-Screen.h*.15).visible(player.mbReady),
            makeText('LEFT INLANE: START COMBO', 40, 'left', 'bottom', gfx).y(-Screen.h*-.05),
            makeText('TARGETS: BUILD SPINNER VALUE', 40, 'left', 'bottom', gfx).y(-Screen.h*-.15),
            // makeText(': SPINNER VALUE => 4000', 40, 'left', 'bottom', gfx, Color.Blue).y(-Screen.h*.25),
            // makeText(': $ VALUE +25', 40, 'left', 'bottom', gfx, Color.Green).y(-Screen.h*.15),
            // makeText(': Add Chip', 40, 'left', 'bottom', gfx, Color.Orange).y(-Screen.h*.05),
            // makeText(': $ VALUE -25', 40, 'left', 'bottom', gfx, Color.Red).y(-Screen.h*-.05),
        ).y(Screen.h*.15));

        this.add(this.score);
        player.watch(() => this.score.text(score(player.score)));

        this.add(this.playerNum);
        this.playerNum.text(`PLAYER ${player.number}`);
        player.watch(() => {
            if (!machine.lastSwitchHit?.wasClosedWithin(4000) && (!player.poker || player.ball?.skillshot)) {
                this.playerNum.visible(player.game.players.length>1 && ((time()-(machine.lastSwitchHit?.lastChange??0))/2000|0)%3===2);
                this.score.visible(player.game.players.length<=1 || ((time()-(machine.lastSwitchHit?.lastChange??0))/2000|0)%3!==2);
            }
            else {
                this.playerNum.visible(false);
                this.score.visible(true);
            }
        });

        this.add(this.diff);
        player.watch(() => {
            this.diff.visible(player.game.ballNum===1 && player.score===0);
            if (machine.sMagnetButton.lastClosed)
                this.diff.text('SKILL LEVEL: '+Difficulty[player.difficulty]);
        });

        this.pokerOrNo.add(this.bank);
        player.watch(() => this.bank.text(''+money(player.store.Poker?.bank ?? 0)));

        this.pokerOrNo.add(this.handsLeft);
        player.watch(() => {
            const left = player.store.Poker?.handsForMb-player.store.Poker?.handsPlayed;
            this.handsLeft.text(`${left} hand${left>1?'s':''} for MB`);
            this.handsLeft.visible(!player.handMbQualified);
        });

        this.add(this.status);

        player.watch(() => this.visible(player === player.game.curPlayer));
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
        // this.x(-Screen.w/2);
        player.watch(() => this.x(player.ball?.skillshot? -Screen.w/2 : Screen.w/2-this.w()));
        this.y(-Screen.h/2+GameGfx.top);
        this.add(gfx.createRect().w(this.w()).h(this.h()).fill('#444444').z(-.1));
        const left = 20;
        const right = this.w()-20;
        const bottom = this.h()-20;
        const top = 20;

        this.add(makeText('STATUS REPORT', 50, 'center', 'middle').x(this.w()/2).y(top+15));

        player.watch(() => this.visible(
            machine.sBothFlippers.onFor(500) && machine.sBothFlippers.lastClosed! > (machine.lastSwitchHit?.lastClosed??0)+1000,
        ));

        const stats = gfx.createGroup();
        this.add(stats);
        const scores = gfx.createGroup();
        this.add(scores);

        this.visible.watch(visible => {
            if (!visible) return;

            {
                const info = [
                    [`${player.store.Poker?.handsWon??0} / ${player.store.Poker?.handsPlayed??0} hands won`],
                    [`$1 = ${comma(player.store.Poker?.cashValue??0)} points`],
                    player.mbsQualified.has('StraightMb')? [`Straight MB ${player.selectedMb!=='HandMb'? 'Ready':'Qualified'}`] : undefined,
                    player.mbsQualified.has('FlushMb')? [`Flush MB ${player.selectedMb!=='HandMb'? 'Ready':'Qualified'}`] : undefined,
                    player.mbsQualified.has('FullHouseMb')? [`Full House MB ${player.selectedMb==='FullHouseMb'? 'Ready':'Qualified'}`] : undefined,
                    player.mbsQualified.has('HandMb')? [`Hand MB ${player.selectedMb==='HandMb'? 'Ready':'Qualified'}`] : undefined,
                ].truthy();
            
                stats.clear();
                let y = top + 55;
                for (const i of info) {
                    stats.add(makeText(i[0], 35, 'left', 'top').x(left).y(y));
                    if (i.length === 2) {
                        // stats.add(makeText(score(game.players[i].score), 35, 'right', 'bottom').x(right).y(y));
                    }
                    y += 35*1.25;
                }
            }

            {
                const h = game.players.length<4? 30 : 20;
                scores.clear();
                if (game.players.length === 1) return;
                let y = bottom;
                for (let i=game.players.length-1; i>=0; i--) {
                    scores.add(makeText(`PLAYER ${i+1}:`, h, 'left', 'bottom').x(left).y(y));
                    scores.add(makeText(`${score(game.players[i].score)} ${money(game.players[i].store.Poker?.bank ?? Poker.BankStart, 6)}`, h, 'right', 'bottom').x(right).y(y));
                    y -= h*1.25;
                }
                scores.add(makeText('SCORES:', h+5, 'center', 'bottom').x(0).w(this.w()).y(y));
            }
        }, true);
    }
}

// export class PlayerScoresGfx extends Group {
//     constructor(
//         public player: Player,
//         public game: Game,
//         public g: PlayerGfx,
//     ) {
//         super(gfx);
//         this.z(50);
//         this.w(Screen.w*.5);
//         this.h(GameGfx.main);
//         this.x(Screen.w/2);
//         // player.watch(() => this.x(player.ball?.skillshot? -Screen.w/2 : Screen.w/2-this.w()));
//         this.y(-Screen.h/2+GameGfx.top);
//         this.add(gfx.createRect().w(this.w()).h(this.h()).fill('#444444').z(-.1));
//         const left = 20;
//         const right = this.w()-20;
//         const bottom = this.h()-20;
//         const top = 20;

//         this.add(makeText('SCORES', 50, 'center', 'middle').x(this.w()/2).y(top+15));

//         player.watch(() => this.visible(
//             machine.sBothFlippers.onFor(500) && machine.sBothFlippers.lastClosed! > (machine.lastSwitchHit?.lastClosed??0)+1000,
//         ));

//         const scores = gfx.createGroup();
//         this.add(scores);

//         this.visible.watch(visible => {
//             if (!visible) return;

//             {
//                 const h = game.players.length<4? 35 : 20;
//                 scores.clear();
//                 if (game.players.length === 1) return;
//                 let y = top + 55;
//                 for (let i=game.players.length-1; i>=0; i--) {
//                     scores.add(makeText(`PLAYER ${i+1}:`, h, 'left', 'bottom').x(left).y(y));
//                     scores.add(makeText(`${score(game.players[i].score)}, ${money(game.players[i].store.Poker!.bank, 4)}`, h, 'right', 'bottom').x(right).y(y));
//                     y += h*1.25;
//                 }
//                 scores.add(makeText('SCORES:', h+5, 'center', 'bottom').x(left).w(this.w()).y(y));
//             }
//         }, true);
//     }
// }