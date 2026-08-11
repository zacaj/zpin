import * as fs from 'fs';

function sum(o: any, into: any) {
    for (const key of Object.keys(o)) {
        if (!(key in into)) {
            if (typeof o[key] === 'number')
                into[key] = [];
            else if  (!o[key]) continue;
            else if (Array.isArray(o[key]))
                into[key] = [];
            else if (typeof o[key] === 'object')
                into[key] = {};
            else continue;
        }

        if (typeof o[key] === 'number')
            into[key].push(o[key]);
        else if (!o[key]) continue;
        else if (Array.isArray(o[key]))
            into[key] = [...into[key], ...o[key]];
        else if (typeof o[key] === 'object')
            sum(o[key], into[key]);
    }
}

const files = fs.readdirSync('./');
const players = {} as any;
const audits = {} as any;
for (const file of files) {
    if (!file.endsWith('.json') || !file.startsWith('game-')) continue;
    const json = JSON.parse(fs.readFileSync(file).toString());
    console.info('processing ', file);
    if ('players' in json) {
        for (const player of json.players) {
            sum(player, players);
        }
    }
    if ('audits' in json) {
        sum(json.audits, audits);
    }
}

fs.writeFileSync('totals.json', JSON.stringify({players, audits}, undefined, 2));
console.info('wrote json');

function flatten(path: string, o: any): {[key: string]: number[]} {
    let ret = {} as any;
    for (const key of Object.keys(o)) {
        if (Array.isArray(o[key]))
            ret[key+path] = o[key];
        else ret = Object.assign(ret, flatten('.'+key+path, o[key]));
    }
    return ret;
}

const flat = Object.assign(flatten('.p', players), flatten('.a', audits));
for (const key of Object.keys(flat))
    flat[key].sort((a,b) => a-b);
let str = Object.keys(flat).join(',')+'\n';
str += Object.keys(flat).map(k => 'x'+flat[k].length).join(',')+'\n';
str += Object.keys(flat).map(k => 'min: '+Math.min(...flat[k])).join(',')+'\n';
str += Object.keys(flat).map(k => 'max: '+Math.max(...flat[k])).join(',')+'\n';
str += Object.keys(flat).map(k => 'avg: '+flat[k].reduce((p, c) => p+c, 0)/flat[k].length).join(',')+'\n';
str += Object.keys(flat).map(k => 'sum: '+flat[k].reduce((p, c) => p+c, 0)).join(',')+'\n';
str += Object.keys(flat).map(k => {
    const counts = {} as {[key: number]: number};
    for (const v of flat[k])
        counts[v] = (counts[v] ?? 0) + 1;
    const most = Math.max(...Object.values(counts));
    const mode = Object.keys(counts).filter(k => counts[k as any] === most);
    return `mode: ${mode.join('|')}@${most} !:${flat[k].length-most}`;
}).join(',')+'\n';
let i=0;
while (true) {
    const values = Object.keys(flat).map(k => flat[k][i]);
    if (!values.some(v => !!v)) break;
    str += values.map(x => x ?? '').join(',') + '\n';
    i++;
}
fs.writeFileSync('totals.csv', str);
console.info('wrote csv');