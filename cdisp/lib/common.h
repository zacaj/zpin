#pragma once

typedef unsigned short u16;
typedef unsigned char u8;

#ifdef _MSC_VER
#define WHITE          0xFFFF
#define BLACK          0x0000
#define BLUE           0x001F
#define BRED           0XF81F
#define GRED 		   0XFFE0
#define GBLUE		   0X07FF
#define RED            0xF800
#define MAGENTA        0xF81F
#define GREEN          0x07E0
#define CYAN           0x7FFF
#define YELLOW         0xFFE0
#define BROWN 		   0XBC40
#define BRRED 		   0XFC07
#define GRAY  		   0X8430
#else
#define WHITE          0xFFFF
#define BLACK          0x0000
#define BLUE           0x1F00
#define BRED           0X1FF8
#define GRED 		   0XE0FF
#define GBLUE		   0XFF07
#define RED            0x00F8
#define MAGENTA        0x1FF8
#define GREEN          0xE007
#define CYAN           0xFF7F
#define YELLOW         0xE0FF
#define BROWN 		   0X40BC
#define BRRED 		   0X07FC
#define GRAY  		   0X3084
#endif

typedef u16 Color;

// #ifdef _MSC_VER
// #define getR(c) (((c&0xFF)))
// #define getG(c) ((((c&0xFF)<<5)|((c&0xFF00)>>11)))
// #define getB(c) (( (c&0xFF00)>>5 ))
// #define makeRGB(r,g,b) (( ((((g&0x1C)<<5)|(b>>3))<<8) | (((r&0xF8)<<3)|((g&E0)>>5))  ))
// #define makeRG(r,g) (( makeRGB(r,g,0)&0xFF ))
// #define makeGB(g,b) (( makeRGB(0,g,b)>>8 ))
// #else
// #define getR(c) (( (c&0xF800)>>8 ))
// #define getG(c) ((  (c&0x7E0)>>3 ))
// #define getB(c) (( (C&0x1F)<<3 ))
// #endif
// #define makeRGB(r,g,b) (( ((((r&0xF8)<<3)|((g&E0)>>5))<<8) | (((g&0x1C)<<5)|(b>>3))  ))
// #define makeRG(r,g) (( makeRGB(r,g,0)>>8 ))
// #define makeGB(g,b) (( makeRGB(0,g,b)&0xFF ))

#define makeRG(r,g) (( ((r&0xF8) | ((g&0xE0)>>5)) ))
#define makeGB(g,b) (( ((g&0x1C)<<3) | ((b)>>3)  ))



// rggb
#ifndef _MSC_VER
#define makeRGB(r,g,b) (( (makeGB(g,b)) | (makeRG(r,g)<<8) ))
#else
#define makeRGB(r,g,b) (( (makeGB(g,b)<<8) | makeRG(r,g) ))
#endif
#define getR(c) (( (c&0xF800) >> 8 ))
#define getG(c) (( (c&0x7E0)>>3 ))
#define getB(c) (( (c&0x1f) << 3 ))
// // swapped
// #define makeRGB(r,g,b) (( (makeGB(g,b)<<8) | makeRG(r,g) ))
// #define getR(c) (( (c&0xF8) << 0 ))
// #define getG(c) ((((c&0x07)<<5)|((c&0xE000)>>11)))
// #define getB(c) (( (c&0x1f00) >> 5 ))
// #endif