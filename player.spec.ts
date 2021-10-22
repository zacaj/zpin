import { Player } from "./modes/player";
import { Game } from "./game";
import { Tree } from "./tree";
import { machine } from "./machine";
import { Poker } from "./modes/poker";

describe('player', () => {
    test('store', async () => {
        machine.sTroughFull.state = true;
        jest.spyOn(Poker, 'start').mockResolvedValue({} as any);
        const game = await Game.start();
        const player = game.curPlayer!;
        const child1 = new class extends Tree {
            bet = 2;

            constructor() {
                super();

                player!.storeData<any>(this, ['bet']);
            }

            override get name(): string {
                return 'Poker';
            }
        };
        expect(player.store.Poker.bet).toBe(2);
        expect(child1.bet).toBe(2);
        child1.bet = 3;
        expect(player.store.Poker.bet).toBe(3);
        expect(child1.bet).toBe(3);

        
        const child2 = new class extends Tree {
            bet = 2;

            constructor() {
                super();

                player.storeData<any>(this, ['bet']);
            }

            override get name(): string {
                return 'Poker';
            }
        };
        expect(player.store.Poker.bet).toBe(3);
        expect(child1.bet).toBe(3);
        expect(child2.bet).toBe(3);

        child2.bet = 4;
        expect(player.store.Poker.bet).toBe(4);
        expect(child1.bet).toBe(4);
        expect(child2.bet).toBe(4);
    });
});