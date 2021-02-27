#include <stdio.h>
#include "lib/Manager.h"
#include "lib/Disp160.h"
#include "lib/Image.h"
#include "HW/DEV_Config.h"

int main() {
	if(DEV_ModuleInit() != 0){
        DEV_ModuleExit();
        return 1;
    } 

    // Image ten("media/128/Playing Card Vectors - Samples 10D.png");
    // Image king("media/128/Playing Card Vectors - Samples KS.png");
    // Image queen("media/128/Playing Card Vectors - Samples QH.png");
    Image test("media/128/test.png");
    // Image test("media/160/lanes_go_stop.png");
    Image overlay("media/160/skill_selected_v.png");

    Disp160* disp = new Disp160(0, ROTATE_0);
    disp->loadFont();
    disp->init();
    
    disp->clear(YELLOW);

    // disp->drawImage(&queen); 
    // disp->drawImage(&king, 0, 160-128); 

    disp->drawImage(&test); 

    // disp->drawRect(20, 40, 140, 60, RED);
    disp->drawText("+$1/(", 0, 78, 60, CENTER_ALL);
    disp->drawImage(&overlay); 

    disp->update();

    disp->savePng("test_160.png");
}