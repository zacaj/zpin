#pragma once
#include "Display.h"

class ST7789 : public Display {
public:    
    ST7789(int number, ROTATE_IMAGE rotate = ROTATE_0, MIRROR_IMAGE mirror = MIRROR_NONE);

    virtual void init();
    virtual void update();
    virtual void power(u8 on);
    virtual void invert(u8 on);

    void setWindow(u16 Xstart, u16 Ystart, u16 Xend, u16 Yend);
};
