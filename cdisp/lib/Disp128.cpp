#include "Disp128.h"
#include <stdio.h>

Disp128::Disp128(int number, ROTATE_IMAGE rotate, MIRROR_IMAGE mirror): 
    ST7735(number, 128, 128, rotate==ROTATE_0 || rotate==ROTATE_90? L2R_U2D : R2L_D2U, 1, rotate, mirror) {
    xOffset = 2;
    yOffset = 1;
}