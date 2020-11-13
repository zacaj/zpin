#include "Disp160.h"


Disp160::Disp160(int number, ROTATE_IMAGE rotate, MIRROR_IMAGE mirror): 
    ST7735(number, 128, 160, L2R_U2D, rotate, mirror) {

}