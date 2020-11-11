#include <stdio.h>
#include "lib/Manager.h"
#include "lib/Disp128.h"
#include "lib/Image.h"
#include "HW/DEV_Config.h"

int main() {
	if(DEV_ModuleInit() != 0){
        DEV_ModuleExit();
        return 1;
    } 

    Image ten("media/128/Playing Card Vectors - Samples 10D.png");
    Image king("media/128/Playing Card Vectors - Samples KS.png");
    Image queen("media/128/Playing Card Vectors - Samples QH.png");

    Manager manager(8);

    manager.displays[4] = new Disp128(1);
    manager.displays[5] = new Disp128(1);
    manager.displays[6] = new Disp128(1);
    manager.displays[7] = new Disp128(1);
    manager.initAll();


    DEV_Delay_ms(2000);

    
    manager.displays[4]->clear(BLUE);

    manager.displays[5]->drawImage(&ten); 
    manager.displays[5]->clear(RED);

    // manager.displays[6]->drawImage(&queen); 

    manager.displays[6]->clear(RED);
    manager.displays[6]->clear(GREEN);
    
    manager.displays[7]->drawImage(&king); 
    manager.displays[7]->clear(BLUE);

    manager.updateAll();


    DEV_Delay_ms(2000);


    manager.displays[5]->drawImage(&king); 

    manager.displays[6]->drawImage(&ten); 
    
    manager.displays[7]->drawImage(&queen); 

    manager.updateAll();
}