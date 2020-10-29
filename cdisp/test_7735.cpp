#include <stdio.h>
#include "Manager.h"
#include "ST7735.h"
#include "Image.h"
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

    manager.displays[1] = new ST7735(1);
    manager.displays[2] = new ST7735(1);
    manager.displays[3] = new ST7735(1);
    manager.displays[4] = new ST7735(1);
    manager.initAll();

    
    manager.displays[1]->clear(BLUE);

    manager.displays[1]->drawImage(&king); 

    manager.displays[2]->clear(RED);

    manager.displays[4]->drawImage(&ten); 
    
    manager.displays[5]->drawImage(&queen); 

    manager.updateAll();
}