#include "Disp160.h"


Disp160::Disp160(int number, MIRROR_IMAGE mirror, ROTATE_IMAGE rotate): 
    ST7735(number, 128, 160, mirror, rotate) {

}