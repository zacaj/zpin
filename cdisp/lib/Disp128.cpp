#include "Disp128.h"
#include <stdio.h>

Disp128::Disp128(int number, MIRROR_IMAGE mirror, ROTATE_IMAGE rotate): 
    ST7735(number, 128, 128, L2R_U2D, mirror, rotate) {
    xOffset = 2;
    yOffset = 1;
}