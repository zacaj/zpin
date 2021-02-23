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

export function dText(text: string): DisplayContent {
    return {
        hash: `text ${text}`,
        text: [{
            text,
            vAlign: 'top',
            x: 0,
            y: 0,
            size: 40,
        }],
    };
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