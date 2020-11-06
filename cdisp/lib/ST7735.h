#pragma once
#include "Display.h"

class ST7735 : public Display {
public:
    int xOffset = 0;
    int yOffset = 0;

    ST7735(int number, int width, int height, LCD_SCAN_DIR scanDir, MIRROR_IMAGE mirror = MIRROR_NONE, ROTATE_IMAGE rotate = ROTATE_0);

    virtual void init();
    virtual void update();

    void setWindow(u16 Xstart, u16 Ystart, u16 Xend, u16 Yend);

    void setScanDir(LCD_SCAN_DIR Scan_dir);
};
