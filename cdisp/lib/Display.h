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

typedef enum {
    L2R_U2D  = 0,	//The display interface is displayed , left to right, up to down
    L2R_D2U  ,
    R2L_U2D  ,
    R2L_D2U  ,

    U2D_L2R  ,
    U2D_R2L  ,
    D2U_L2R  ,
    D2U_R2L  ,
} LCD_SCAN_DIR;

class Display {
protected:
    Display(int number, int width, int height, LCD_SCAN_DIR scanDir, ROTATE_IMAGE rotate = ROTATE_0, MIRROR_IMAGE mirror = MIRROR_NONE);

public:
    int number;
    int width, height;

    u16 pixWidth, pixHeight;
    u16* pixels;
    MIRROR_IMAGE mirror = MIRROR_NONE;
    ROTATE_IMAGE rotate = ROTATE_0;
    LCD_SCAN_DIR scanDir;

    
    virtual void init() = 0;

    virtual void update() = 0;

    void clear(Color color);

    void setPixel(u16 Xpoint, u16 Ypoint, Color Color);

    void drawRect(u16 x1, u16 y1, u16 x2, u16 y2, Color color);

    void drawImage(Image* image, u16 xStart = 0, u16 yStart = 0);

    void savePng(const char* path);
};
