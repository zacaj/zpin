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

    Image king("media/128/Playing Card Vectors - Samples KS.png");
    Image ten("media/128/Playing Card Vectors - Samples 10D.png");
    Image queen("media/128/Playing Card Vectors - Samples QH.png");

    Disp128* disp = new Disp128(0);
    disp->init();
    
    disp->clear(BLUE);

    disp->drawImage(&king); 
    disp->drawRect(20, 40, 100, 50, BLUE);

    disp->update();
}