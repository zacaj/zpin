import * as fs from 'fs';
import { Game } from './game';
import { Log } from './log';
import { HighscoreEntry } from './modes/highscore.mode';
import { comma, money, num } from './util';

export type Highscore = {
    name: string;
    score: string;
};

export type Highscores = {
    'HIGH SCORES': Highscore[];
    'TOP EARNERS': Highscore[];
    'LOW SCORES': Highscore[];
    'TOP CASHOUT': Highscore[];
    'STRAIGHT MB CHAMPION': Highscore[];
    'FLUSH MB CHAMPION': Highscore[];
    'FULL HOUSE MB CHAMPION': Highscore[];
    'HAND MB CHAMPION': Highscore[];
    'BIGGEST HAND WON': Highscore[];
    'BIGGEST HAND LOST': Highscore[];
    'MOST HANDS PLAYED': Highscore[];
    'MOST HANDS WON': Highscore[];
    '2X CHAMPION': Highscore[];
    'BONUS CHAMPION': Highscore[];
    'SKILLSHOT CHAMPION': Highscore[];
};

export function getHighscores(): Highscores {
    try {
        const json = fs.readFileSync('highscores.json', 'utf8');
        const s = JSON.parse(json) as Highscores; 
        return s;
    } catch (e) {
        Log.log('console', 'no highscores found, using defaults');
        return {
            'HIGH SCORES': [
                {
                    name: 'ZAC',
                    score: '2,000,000',
                },
                {
                    name: 'RON',
                    score: '1,000,000',
                },
                {
                    name: 'SAG',
                    score: '500,000',
                },
                {
                    name: 'STP',
                    score: '10',
                },
            ],
            'TOP EARNERS': [
                {
                    name: 'ZAC',
                    score: '$10,000',
                },
                {
                    name: 'BEN',
                    score: '$7,500',
                },
                {
                    name: 'NES',
                    score: '$5,000',
                },
                {
                    name: 'SXM',
                    score: '$1',
                },
            ],
            'LOW SCORES': [
                {
                    name: 'RON',
                    score: '-2,000,000',
                },
                {
                    name: 'STP',
                    score: '-1,000,000',
                },
                {
                    name: 'SAG',
                    score: '-500,000',
                },
                {
                    name: 'YYZ',
                    score: '0',
                },
            ],
            'TOP CASHOUT': [
                {
                    name: 'PNT',
                    score: '500,000',
                },
            ],
            'STRAIGHT MB CHAMPION': [
                {
                    name: 'KME',
                    score: '500,000',
                },
            ],
            'FLUSH MB CHAMPION': [
                {
                    name: 'KED',
                    score: '500,000',
                },
            ],
            'FULL HOUSE MB CHAMPION': [
                {
                    name: 'D F',
                    score: '500,000',
                },
            ],
            'HAND MB CHAMPION': [
                {
                    name: 'SUM',
                    score: '500,000',
                },
            ],
            'BIGGEST HAND WON': [
                {
                    name: 'MJR',
                    score: '$1,000',
                },
            ],
            'BIGGEST HAND LOST': [
                {
                    name: 'B P',
                    score: '$1,000',
                },
            ],
            'MOST HANDS PLAYED': [
                {
                    name: 'NJM',
                    score: '3',
                },
            ],
            'MOST HANDS WON': [
                {
                    name: 'NKY',
                    score: '3',
                },
            ],
            '2X CHAMPION': [
                {
                    name: 'S P',
                    score: '100,000',
                },
            ],
            'BONUS CHAMPION': [
                {
                    name: 'FRE',
                    score: '50,000',
                },
            ],
            'SKILLSHOT CHAMPION': [
                {
                    name: 'ARZ',
                    score: '2',
                },
            ],
        };
    }
}

export function saveHighscores(highscores: Highscores) {
    try {
        // for (const type of Object.keys(highscores) as (keyof Highscores)[])
        //     while (highscores[type].length > 4)
        //         highscores[type].pop();
        fs.writeFileSync('highscores.json', JSON.stringify(highscores, null, 2));
    }
    catch (err) {
        Log.error('console', 'error saving highscores: ', err, highscores);
    }
}

function parse(n: string): number {
    return num(n.replace(/[^\d-]/g, ''));
}

export async function checkForScores(game: Game) {
    const highscores = getHighscores();

    for (const player of game.players) {
        const playerScores: [keyof Highscores, string, number][] = [
            ['HIGH SCORES', comma(player.score), 1],
            ['TOP EARNERS', money(player.store.Poker!.bank), 1],
            ['LOW SCORES', comma(player.score), -1],
            ['TOP CASHOUT', money(player.store.Poker!.topCashout), 1],
            ['STRAIGHT MB CHAMPION', comma(player.store.StraightMb?.topTotal ?? 0), 1],
            ['FLUSH MB CHAMPION', comma(player.store.FlushMb?.topTotal ?? 0), 1],
            ['FULL HOUSE MB CHAMPION', comma(player.store.FullHouseMb?.topTotal ?? 0), 1],
            ['HAND MB CHAMPION', comma(player.store.HandMb?.topTotal ?? 0), 1],
            ['BIGGEST HAND WON', money(player.store.Poker!.biggestWin), 1],
            ['BIGGEST HAND LOST', money(player.store.Poker!.biggestLoss), 1],
            ['MOST HANDS PLAYED', comma(player.store.Poker!.handsPlayed)+' HANDS', 1],
            ['MOST HANDS WON', comma(player.store.Poker!.handsWon)+' HANDS', 1],
            ['2X CHAMPION', comma(player.store.Multiplier?.topTotal ?? 0), 1],
            ['BONUS CHAMPION', comma(player.store.Bonus?.topTotal ?? 0), 1],
            ['SKILLSHOT CHAMPION', comma(player.store.Skillshot?.skillshotCount ?? 0)+' MADE', 1],
        ];

        const highs = playerScores.flatMap(([type, value, mult]) => {
            const scores = highscores[type];
            const score: Highscore = {
                name: '?',
                score: value,
            };
            const pos = scores.insert(score, ({score}) => parse(value)*mult > parse(score)*mult);
            scores.splice(scores.length-1, 1);
            if (pos < scores.length-1) return [type];
            return [];
        });

        if (highs.length) {
            const node = new HighscoreEntry(game, player, highs, highscores);
            game.addTemp(node);
            await game.await(node.onEnd());
        }
    }

    saveHighscores(highscores);
}