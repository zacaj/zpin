#include "Disp160.h"


Disp160::Disp160(int number, ROTATE_IMAGE rotate, MIRROR_IMAGE mirror): 
    ST7735(number, 128, 160, rotate==ROTATE_0 || rotate==ROTATE_90? L2R_U2D : R2L_D2U, 0, rotate, mirror) {

}