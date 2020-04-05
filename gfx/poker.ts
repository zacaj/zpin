import { Group } from "aminogfx-gl";
import { Poker, Card, getFileForCard } from "../poker";
import { gfx, makeImage, Screen } from "../gfx";
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

        poker.listen(onChange(hand), () => this.refresh());
        this.refresh();
    }

    refresh() {
        this.clear();
        for (const card of this.hand) {
            const file = getFileForCard(card);
            const img = makeImage(file, 100, PokerHand.h);
            img.x(PokerHand.w/7*this.children.length-PokerHand.w/2);
            this.add(img);
        }
    }
}