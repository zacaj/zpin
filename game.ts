import { SwitchEvent } from "./switch-matrix";
import { Events, onType } from "./events";

export class Game {
    constructor() {
        Events.listen({onSwitch: this}, onType(SwitchEvent));
    }

    onSwitch(e: SwitchEvent) {
        console.log('sw event ', e);
    }
}