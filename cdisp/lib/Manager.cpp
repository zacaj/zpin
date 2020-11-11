#include "Manager.h"
#include "../HW/DEV_Config.h"
#include "Display.h"

Manager::Manager(int displayCount) {
    numDisplays = displayCount;
    displays = new Display*[displayCount];
    for (int i=0; i<displayCount; i++)
        displays[i] = nullptr;
}

void Manager::updateDisplay(int num) {
    if (!displays[num]) return;

    selectDisplay(num);
    displays[num]->update();
}

void Manager::updateAll() {
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    // DEV_Delay_ms(10);
    DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    // DEV_Delay_ms(10);
    for (int i=0; i<numDisplays+2; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        // DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    }

    DEV_Digital_Write(DEV_CS_DAT_PIN, 0);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
    // DEV_Delay_ms(10);

    DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    // DEV_Delay_ms(10);

    for (int i=0; i<numDisplays; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        // DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
        if (displays[i])
            displays[i]->update();
    }
}

void Manager::initAll() {
    // reset all
	DEV_Digital_Write(DEV_RST_PIN, 0);
	DEV_Delay_ms(200);
	DEV_Digital_Write(DEV_RST_PIN, 1);
	DEV_Delay_ms(200);


    // clear selects to high
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    DEV_Delay_ms(10);
    DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    DEV_Delay_ms(10);
    for (int i=0; i<numDisplays+2; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    }

    // prime
    DEV_Digital_Write(DEV_CS_DAT_PIN, 0);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
    DEV_Delay_ms(10);

    DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    DEV_Delay_ms(10);

    // init one at a time
    for (int i=0; i<numDisplays; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
        if (displays[i])
            displays[i]->init();
    }
}

void Manager::selectDisplay(int num) {
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    DEV_Delay_ms(10);
    DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    DEV_Delay_ms(10);
    for (int i=0; i<numDisplays+2; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    }

    DEV_Digital_Write(DEV_CS_DAT_PIN, 0);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
    DEV_Delay_ms(10);

    DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    DEV_Delay_ms(10);

    for (int i=0; i<num; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    }
}
void Manager::selectAll() {
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    DEV_Delay_ms(10);
    DEV_Digital_Write(DEV_CS_DAT_PIN, 0);
    DEV_Delay_ms(10);
    for (int i=0; i<numDisplays+2; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    }

    DEV_Delay_ms(100);
}