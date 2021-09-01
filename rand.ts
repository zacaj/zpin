import seedrandom = require('seedrandom');

export class Rng {

    private rng!: seedrandom.prng;
    constructor(
        seed = Math.random().toString(),
    ) {
        this.rng = seedrandom(seed);
    }

    rand(): number {
        return this.rng();
    }

    randRange(start: number, end: number): number {
        return Math.floor(this.rng()*(end-start+1)+start);
    }

    weightedRand(...weights: number[]): number {
        let sum = weights.reduce((prev, cur) => prev+cur, 0);
        const rand = Math.floor(this.rng()*sum);
        for (let i=0; i<weights.length; i++) {
            sum -= weights[i];
            if (sum <= rand) return i;
        }
        return weights.length - 1;
    }

    weightedSelect<T>(...weights: [number, T][]): T {
        return weights[this.weightedRand(...weights.map(x => x[0]))][1];
    }

    weightedRange(...weights: [number, number, number?][]): number {
        const i = this.weightedRand(...weights.map(x => x[0]));
        const weight = weights[i];
        if (weight[2])
            return this.randRange(weight[1], weight[2]);
        else 
            return weight[1];
    }

    randSelect<T>(...values: T[]): T {
        return this.randSelectMany(1, ...values)[0];
    }
    randSelectRange<T>(start: number, end: number, ...values: T[]): T[] {
        return this.randSelectMany(this.randRange(start, end), ...values);
    }
    randSelectMany<T>(count: number, ...values: T[]): T[] {
        const ret: T[] = [];
        while (ret.length < count) {
            const v = values[this.randRange(0, values.length-1)];
            if (!ret.includes(v))
                ret.push(v);
        }
        return ret;
    }

    shuffle<T>(arr: T[], times = 3): T[] {
        for (let k=0; k<times; k++) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(this.rand() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
        }
        return arr;
    }
}