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
            // 'BIGGEST LOSERS': [
            //     {
            //         name: 'ZAC',
            //         score: '-$2,500',
            //     },
            //     {
            //         name: 'BEN',
            //         score: '$-1,500',
            //     },
            //     {
            //         name: 'STP',
            //         score: '$10',
            //     },
            //     {
            //         name: 'SAG',
            //         score: '$100',
            //     },
            // ],
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
        ];

        const highs = playerScores.flatMap(([type, value, mult]) => {
            const scores = highscores[type];
            const score: Highscore = {
                name: '?',
                score: value,
            };
            const pos = scores.insert(score, ({score}) => parse(value)*mult > parse(score)*mult);
            if (pos < 4) return [type];
            scores.remove(score);
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