import { Group, Node } from "aminogfx-gl";
import { makeText, pfx } from "./gfx";
import { Color } from "./light";

export type DisplayContent = {
    hash: string;
    text?: string;
    image?: string;
    color?: Color;
};

export function dText(text: string): DisplayContent {
    return {
        hash: `text ${text}`,
        text,
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