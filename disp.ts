import { Group, Node } from "aminogfx-gl";
import { makeText, pfx } from "./gfx";
import { Color } from "./light";

export type DisplayContent = {
    hash: string;
    image?: string;
    color?: Color;
    text?: {
        text: string;
        vAlign: 'top'|'bottom'|'center'|'baseline';
        x: number;
        y: number;
        size: number;
    }[];
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

export function dFitText(text: string, y: number, vAlign: 'top'|'bottom'|'center'|'baseline'): DisplayContent {
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
            size = 72;
            x = 18;
            break;
        case 4:
            size = 60;
            x = 13;
            break;
        case 5:
            size = 52;
            x = 15;
            break;
        case 6: 
            size = 40;
            x = 20;
            break;
        case 7:
            size = 40;
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
        image: name,
    };
}

export function dClear(color: Color): DisplayContent {
    return {
        hash: `clear ${color}`,
        color,
    };
}

export function dHash(d: Partial<DisplayContent>): DisplayContent {
    return {
        hash: JSON.stringify(d),
        ...d,
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