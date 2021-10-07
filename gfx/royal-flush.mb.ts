import { Group, Text } from 'aminogfx-gl';
import { Skillshot } from '../modes/skillshot';
import { gfx, makeText, Screen, alert, ModeGroup, gWait } from '../gfx';
import { wrap, comma, score } from '../util';
import { onChange } from '../state';
import { TreeEndEvent } from '../tree';
import { GameGfx } from './game';
import { RoyalFlushMb } from '../modes/royal-flush.mb';
import { PokerHand } from './poker';
import { time, wait } from '../timer';
import { fork } from '../promises';
import { playSound } from '../sound';

// eslint-disable-next-line no-undef
export class RoyalFlushMbGfx extends ModeGroup {
    notInstructions = gfx.createGroup();
    instr1 = makeText('TARGETS INCREASE SPINNER VALUE', 40, 'center', 'bottom').y(Screen.h*.1);
    instr2 = makeText('SHOOT RIGHT, CENTER, THEN LEFT BANKS', 40, 'center', 'bottom').y(Screen.h*.3);
    instr3 = makeText('TO LIGHT SPINNER JACKPOT', 40, 'center', 'bottom').y(Screen.h*.4);

    spinnerValue = makeText('SPINNER VALUE: X Per SPIN', 40, 'center', 'bottom').y(Screen.h*0);

    mbTotal = makeText('X mb total: y', 50, 'center', 'bottom').y(Screen.h*.05);
    bankValue = makeText('RIGHT TARGETS ADD Z TO VALUE', 50, 'center', 'bottom').y(Screen.h*.2);
    rightBankValue = makeText('RIGHT TARGETS ADD Z TO VALUE', 40, 'center', 'bottom').y(Screen.h*.15);
    centerBankValue = makeText('RIGHT TARGETS ADD Z TO VALUE', 40, 'center', 'bottom').y(Screen.h*.25);
    leftBankValue = makeText('RIGHT TARGETS ADD Z TO VALUE', 40, 'center', 'bottom').y(Screen.h*.35);

    spinnerJp = makeText('SPINNER JACKPOT IS LIT', 60, 'center', 'bottom').y(Screen.h*.4);
    superJp = makeText('SUPER IS READY!', 60, 'center', 'bottom').y(Screen.h*.0);

    spinsLeft = makeText('X SPINS TO LIGHT SUPER', 40, 'center', 'bottom').y(Screen.h*.15);
    superValue = makeText('SUPER VALUE: X', 40, 'center', 'bottom').y(Screen.h*.3);

    ballSave = makeText('BALL SAVE: X', 40, 'center', 'bottom').y(Screen.h*.48);

    hand!: PokerHand;

    doneCb!: () => any;
    ready = new Promise(resolve => this.doneCb = resolve);

    constructor(
        public mb: RoyalFlushMb,
    ) {
        super(mb);
        this.z(mb.gPriority);

        this.hand = new PokerHand(mb, mb.hand, true);
        this.hand.sx(1).sy(1).z(-.2).y(Screen.h*-.25);
        this.hand.add(gfx.createRect().fill('#000000').opacity(0.4).z(.1).w(PokerHand.w*7).h(PokerHand.h));
        this.add(this.hand);
        this.add(this.notInstructions);

        const title = makeText('ROYAL FLUSH', 100).y(Screen.h*-.28);
        this.notInstructions.add(title);
        title.rz.anim({
            from: -5,
            to: 5,
            autoreverse: true,
            duration: 2000,
            loop: -1,
        }).start();
        title.sx.anim({
            from: .8,
            to: 1.2,
            autoreverse: true,
            duration: 1000,
            loop: -1,
        }).start();

        fork((async () => {
            this.add(this.instr1, this.instr2, this.instr3);
            await gWait(6000, '');
            this.remove(this.instr1, this.instr2, this.instr3);
            this.mbTotal.text(`FLUSH MB TOTAL: ${score(mb.player.flushMbStatus)}`);
            this.bankValue.text(`RIGHT TARGETS ADD ${score(mb.bankValue[0])} TO VALUE`);
            this.add(this.mbTotal);
            void playSound('clunk a');
            await gWait(1500, '');
            this.add(this.bankValue);
            void playSound('clunk c');
            await gWait(3000, '');
            this.mbTotal.visible(false);
            this.bankValue.visible(false);
            await gWait(100, '');

            this.mbTotal.text(`FULL HOUSE MB TOTAL: ${score(mb.player.fullHouseMbStatus)}`);
            this.bankValue.text(`CENTER TARGETS ADD ${score(mb.bankValue[1])} TO VALUE`);
            this.mbTotal.visible(true);
            void playSound('clunk b');
            await gWait(1500, '');
            this.bankValue.visible(true);
            void playSound('clunk d');
            await gWait(3000, '');
            this.mbTotal.visible(false);
            this.bankValue.visible(false);
            await gWait(100, '');

            this.mbTotal.text(`STAIGHT MB TOTAL: ${score(mb.player.straightMbStatus)}`);
            this.bankValue.text(`LEFT TARGETS ADD ${score(mb.bankValue[2])} TO VALUE`);
            this.mbTotal.visible(true);
            void playSound('clunk c');
            await gWait(1500, '');
            this.bankValue.visible(true);
            void playSound('clunk e');
            await gWait(3000, '');
            this.mbTotal.visible(false);
            this.bankValue.visible(false);
            await gWait(100, '');

            this.mbTotal.text(`HANDS WON: ${mb.player.store.Poker.handsWon}`);
            this.bankValue.text(`${mb.ballSave} SECONDS OF UNLIMITED BALL SAVE`);
            this.mbTotal.visible(true);
            void playSound('clunk d');
            await gWait(1500, '');
            this.bankValue.visible(true);
            void playSound('clunk b');
            await gWait(3000, '');
            this.mbTotal.visible(false);
            this.bankValue.visible(false);
            await gWait(100, '');

            this.mbTotal.text(`GET READY`);
            this.mbTotal.visible(true);
            void playSound('clunk c');
            this.doneCb();

            this.remove(this.bankValue);
            this.add(this.leftBankValue, this.rightBankValue, this.centerBankValue);
            await gWait(2000, '');
            this.add(this.spinnerValue);
            void playSound('clunk f');
            this.remove(this.mbTotal);
            await gWait(500, '');
        })());

        this.add(this.spinnerJp, this.spinsLeft, this.superValue, this.ballSave, this.superJp);
        mb.watch(() => {
            this.spinnerValue.text(`SPINNER VALUE: ${score(mb.value)} Per SPIN`);
            const build = mb.state._==='bankLit' || mb.state._==='jackpotLit' || mb.state._==='starting';
            this.spinnerValue.visible(build);
            this.spinnerJp.visible(mb.state._==='jackpotLit' && mb.state.spins===0);
            this.leftBankValue.text(`LEFT TARGETS ADD ${score(mb.bankValue[2])} TO VALUE`).visible(mb.state._==='bankLit' && mb.banks.indexOf(mb.state.curBank)<=2);
            this.centerBankValue.text(`CENTER TARGETS ADD ${score(mb.bankValue[1])} TO VALUE`).visible(mb.state._==='bankLit' && mb.banks.indexOf(mb.state.curBank)<=1);
            this.rightBankValue.text(`RIGHT TARGETS ADD ${score(mb.bankValue[0])} TO VALUE`).visible(mb.state._==='bankLit' && mb.banks.indexOf(mb.state.curBank)<=0);
            this.spinsLeft.visible(mb.state._==='jackpotLit' && mb.state.spins>0);
            this.spinsLeft.text(mb.state._==='jackpotLit'? `${RoyalFlushMb.SpinsForSuper - mb.state.spins} SPINS TO LIGHT SUPER` : '');
            this.superValue.visible((mb.state._==='jackpotLit' && mb.state.spins>0) || mb.state._==='superLit');
            this.superValue.text(`SUPER: ${score(mb.superValue)}`);
            const ballSaveLeft = -(time() - mb.startTime - mb.ballSave*1000);
            this.ballSave.text(ballSaveLeft>0? `BALL SAVE: ${Math.floor(ballSaveLeft/1000)}` : 'DRAINING WILL END MODE');
            this.ballSave.visible(mb.state._!=='starting');
            this.superJp.visible(mb.state._==='superLit');
        });
    }
}