import { Group } from "aminogfx-gl";
import { Skillshot } from "../modes/skillshot";
import { gfx, makeText, Screen } from "../gfx";

export class SkillShotGfx extends Group {
    constructor(
        public ss: Skillshot,
    ) {
        super(gfx);
        this.z(-ss.priority);

        this.add(makeText('skillshot ready', 50, 'center', 'bottom').y(Screen.h/2));
    }
}