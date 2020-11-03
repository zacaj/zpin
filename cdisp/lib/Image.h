#pragma once
#include "common.h"

class Image {
public:
    u16 width, height;
    u16* pixels;

    Image(const char* path);

    Color getColor(u16 x, u16 y);
};