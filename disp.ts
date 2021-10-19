import { Group, Node } from "aminogfx-gl";
import { Display, makeText, pfx } from "./gfx";
import { Color } from "./light";
import { time } from "./timer";

export type DisplayContent = {
    hash: string;
    images?: string[];
    color?: Color;
    inverted?: boolean;
    text?: {
        text: string;
        vAlign: 'top'|'bottom'|'center'|'baseline';
        x: number;
        y: number;
        size: number;
    }[];
    off?: true;
};

export function dText(text: string, x: number, y: number, vAlign: 'top'|'bottom'|'center'|'baseline', size: number): DisplayContent {
    return {
        hash: `text ${text}`,
        text: [{
            text,
            vAlign,
            x,
            y,
            size,
        }],
    };
}

export function dFitText(text: string, y: number = 64, vAlign: 'top'|'bottom'|'center'|'baseline' = 'center'): DisplayContent {
    let size: number;
    let x: number;
    switch (text.length) {
        case 1:
            size = 72;
            x = 60;
            break;
        case 2:
            size = 72;
            x = 40;
            break;
        case 3:
            size = 78;
            x = 22;
            break;
        case 4:
            size = 70;
            x = 13;
            break;
        case 5:
            size = 62;
            x = 5;
            break;
        case 6: 
            size = 55;
            x = 7;
            break;
        case 7:
            size = 55;
            x = 2;
            break;
        default:
            size = 30;
            x = 2;
            break;
    }
    return dText(text, x, y, vAlign, size);
}

export function dImage(name: string): DisplayContent {
    return {
        hash: `image ${name}`,
        images: [name],
    };
}

export function dClear(color: Color = Color.Black): DisplayContent {
    return {
        hash: `clear ${color}`,
        color,
    };
}

export function dOff(): DisplayContent {
    return {
        hash: 'off',
        off: true,
    };
}

export function dInvert(inverted: boolean, disp?: DisplayContent): DisplayContent {
    return dHash({
        ...disp,
        inverted,
    });
}

export function dFlash(disp: DisplayContent, on = 200, off = 200) {
    return dInvert(time()%(on+off)>off, disp);
}

export function dHash(d: Partial<DisplayContent>): DisplayContent {
    return {
        ...d,
        hash: JSON.stringify(d),
    };
}

export function dMix(func: (() => DisplayContent|undefined)|DisplayContent|undefined): (state?: DisplayContent[]) => DisplayContent[] | undefined {
    return prev => {
        const l = typeof func==='function'? func() : func;
        if (l)
            return [l, ...(prev??[])];
        else
            return prev;
    };
}

export function dMany(...content: DisplayContent[]): DisplayContent {
    let obj: DisplayContent = { hash: ''};
    for (const c  of content)
        obj = {...obj, ...c, images: [...obj.images ?? [], ...c.images ?? []]};
    return dHash(obj);
}