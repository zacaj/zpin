#include "Manager.h"
#include "../HW/DEV_Config.h"
#include "Display.h"
//#ifdef 
//#include <unistd.h>
#include <time.h>

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
    displays[num]->clear(BLACK);

    printf(" flip display %i\n", num);
}

void Manager::updateDisplays(u8* on, int num) {
    selectDisplays(on);
    displays[num]->update();
    for (int i=0; i<numDisplays; i++) {
        if (!on[i]) continue;
        displays[i]->clear(BLACK);

        printf(" flip display %i\n", i);
    }
}

void Manager::updateAll() {
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    //DEV_Delay_ms(10);
    DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    //DEV_Delay_ms(10);
    for (int i=0; i<numDisplays+2; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        //DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    }

    DEV_Digital_Write(DEV_CS_DAT_PIN, 0);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
    //DEV_Delay_ms(10);

    DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    //DEV_Delay_ms(10);

    for (int i=0; i<numDisplays; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        //DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
        if (displays[i])
            displays[i]->update();
    }
}

void Manager::initAll() {
    printf("initializing displays... ");
    fflush(stdout);
    clock_t start = clock();

    // reset all
	DEV_Digital_Write(DEV_RST_PIN, 0);
	DEV_Delay_ms(200);
	DEV_Digital_Write(DEV_RST_PIN, 1);
	DEV_Delay_ms(500);


    // clear selects to high
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    //DEV_Delay_ms(10);
    DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    //DEV_Delay_ms(10);
    for (int i=0; i<numDisplays+2; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        //DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    }

    // prime
    DEV_Digital_Write(DEV_CS_DAT_PIN, 0);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
    //DEV_Delay_ms(10);

    DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    //DEV_Delay_ms(10);

    // init one at a time
    for (int i=0; i<numDisplays; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        //DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
        if (displays[i]) {
            ///DEV_Delay_ms(100);
            displays[i]->init();
            printf("%i, ", i);
    fflush(stdout);
        }
    }

    printf("\ndone in %.3f sec\n", (double)(clock()-start)/(CLOCKS_PER_SEC)*10);
    fflush(stdout);
}

void Manager::selectDisplay(int num) {
    // DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    // //DEV_Delay_ms(10);
    // DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    // //DEV_Delay_ms(10);
    // for (int i=0; i<numDisplays+2; i++) {   
    //     DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
    //     //DEV_Delay_ms(10);
    //     DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    // }

    // DEV_Digital_Write(DEV_CS_DAT_PIN, 0);
    // DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
    // //DEV_Delay_ms(10);

    // DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    // DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    // //DEV_Delay_ms(10);

    // for (int i=0; i<=num; i++) {   
    //     DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
    //     //DEV_Delay_ms(10);
    //     DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    // }
    // ///DEV_Delay_ms(100);



    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);

    for (int i=numDisplays; i>=0; i--) {
        DEV_Digital_Write(DEV_CS_DAT_PIN, i!=num);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    }

    DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);



}

void Manager::selectDisplays(u8* on) {
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);

    for (int i=numDisplays-1; i>=0; i--) {
        DEV_Digital_Write(DEV_CS_DAT_PIN, !on[i]);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    }

    DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
}

void Manager::selectAll() {
    DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    //DEV_Delay_ms(10);
    DEV_Digital_Write(DEV_CS_DAT_PIN, 0);
    //DEV_Delay_ms(10);
    for (int i=0; i<numDisplays+2; i++) {   
        DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
        //DEV_Delay_ms(10);
        DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    }

    ///DEV_Delay_ms(100);
}