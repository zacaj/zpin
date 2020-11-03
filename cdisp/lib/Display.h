#pragma once
#include "common.h"
class Image;

typedef enum {
    MIRROR_NONE  = 0x00,
    MIRROR_HORIZONTAL = 0x01,
    MIRROR_VERTICAL = 0x02,
    MIRROR_ORIGIN = 0x03,
} MIRROR_IMAGE;

typedef enum { 
    ROTATE_0 =   0,
    ROTATE_90 =  90,
    ROTATE_180 = 180,
    ROTATE_270 = 270,
} ROTATE_IMAGE;

class Display {
protected:
    Display(int number, int width, int height, MIRROR_IMAGE mirror = MIRROR_NONE, ROTATE_IMAGE rotate = ROTATE_0);

public:
    int number;
    int width, height;

    u16 pixWidth, pixHeight;
    u16* pixels;
    MIRROR_IMAGE mirror = MIRROR_NONE;
    ROTATE_IMAGE rotate = ROTATE_0;

    
    virtual void init() = 0;

    virtual void update() = 0;

    void clear(Color color);

    void setPixel(u16 Xpoint, u16 Ypoint, Color Color);

    void drawRect(u16 x1, u16 y1, u16 x2, u16 y2, Color color);

    void drawImage(Image* image, u16 xStart = 0, u16 yStart = 0);
};
