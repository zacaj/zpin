#pragma once
#include "Display.h"

class ST7789 : public Display {
public:    
    ST7789(int number, MIRROR_IMAGE mirror = MIRROR_NONE, ROTATE_IMAGE rotate = ROTATE_0);

    virtual void init();
    virtual void update();

    void setWindow(u16 Xstart, u16 Ystart, u16 Xend, u16 Yend);
};
