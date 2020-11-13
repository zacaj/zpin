#pragma once

#include "ST7735.h"

class Disp128 : public ST7735 {
public:
    Disp128(int number, ROTATE_IMAGE rotate = ROTATE_0, MIRROR_IMAGE mirror = MIRROR_NONE);
};