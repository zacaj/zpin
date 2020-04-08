import { Group, ImageView } from "aminogfx-gl";
import { Poker, Card, getFileForCard } from "../poker";
import { gfx, makeImage, Screen, Image } from "../gfx";
import { onChange } from "../state";

export class PokerGfx extends Group {
    constructor(
        public poker: Poker,
    ) {
        super(gfx);

        this.add(new PokerHand(poker, poker.player).x(Screen.w/2).y(Screen.h/2-PokerHand.h*1.1));
        this.add(new PokerHand(poker, poker.dealer).x(Screen.w/2).y(Screen.h/2+PokerHand.h*1.1));
    }
}

class PokerHand extends Group {
    static w = 800;
    static h = 150;
    constructor(
        public poker: Poker,
        public hand: (Card|null)[],
    ) {
        super(gfx);
        this.originX(0.5).originY(0.5);
        for (let i=0; i<7; i++) {
            const img = makeImage('', 100, PokerHand.h, false);
            img.x(PokerHand.w/7*this.children.length-PokerHand.w/2);
            this.add(img);
        }

        poker.listen(onChange(hand), () => this.refresh());
        this.refresh();
    }

    refresh() {
        let i=0;
        for (const card of this.hand) {
            const file = getFileForCard(card);
            Image.set(this.children[i++] as ImageView, file);
        }
    }
}