#include "ST7789.h"
#include "../HW/DEV_Config.h"

ST7789::ST7789(int number, ROTATE_IMAGE rotate, MIRROR_IMAGE mirror):
    Display(number, 320, 240, L2R_U2D, rotate, mirror) {
        
}

static void LCD_Write_Command(UBYTE data)	 
{	
	DEV_Digital_Write(DEV_DC_PIN, 0);
	DEV_SPI_WriteByte(data);
}

static void LCD_WriteData_Byte(UBYTE data) 
{	
	DEV_Digital_Write(DEV_DC_PIN, 1);
	DEV_SPI_WriteByte(data);  
}  

static void LCD_WriteData_Word(UWORD data)
{
	DEV_Digital_Write(DEV_DC_PIN, 1);
	DEV_SPI_WriteByte((data>>8) & 0xff);
	DEV_SPI_WriteByte(data);
}	 


typedef enum {
    SWRESET = 0x01,
    SLPIN = 0x10,
    SLPOUT = 0x11,
    INVOFF = 0x20,
    INVON = 0x21,
    PVGAMCTRL = 0xE0,
    NVGAMCTRL = 0xE1,
    COLMOD = 0x3A,
    MADCTL = 0x36,
    DISPOFF = 0x28,
    DISPON = 0x29,
    CASET = 0x2A,
    RASET = 0x2B,
    RAMWR = 0x2C,
    PORCTRL = 0xB2,
    GCTRL = 0xB7,
    VCOMS = 0xBB,
} Command;

void ST7789::init() {
    // reset
	DEV_Delay_ms(100);
	DEV_Digital_Write(DEV_RST_PIN, 0);
	DEV_Delay_ms(100);
	DEV_Digital_Write(DEV_RST_PIN, 1);
	DEV_Delay_ms(100);

    // init
    LCD_Write_Command(SWRESET);
	DEV_Delay_ms(150);

    LCD_Write_Command(MADCTL);
	LCD_WriteData_Byte(0x00); 

	LCD_Write_Command(COLMOD); 
	LCD_WriteData_Byte(0x05);

	LCD_Write_Command(INVON); 

	LCD_Write_Command(CASET);
	LCD_WriteData_Byte(0x00);
	LCD_WriteData_Byte(0x00);
	LCD_WriteData_Byte(0x01);
	LCD_WriteData_Byte(0x3F);

	LCD_Write_Command(RASET);
	LCD_WriteData_Byte(0x00);
	LCD_WriteData_Byte(0x00);
	LCD_WriteData_Byte(0x00);
	LCD_WriteData_Byte(0xEF);

	LCD_Write_Command(PORCTRL);
	LCD_WriteData_Byte(0x0C);
	LCD_WriteData_Byte(0x0C);
	LCD_WriteData_Byte(0x00);
	LCD_WriteData_Byte(0x33);
	LCD_WriteData_Byte(0x33);

	LCD_Write_Command(GCTRL);
	LCD_WriteData_Byte(0x35); 

	LCD_Write_Command(VCOMS);
	LCD_WriteData_Byte(0x1F);

	LCD_Write_Command(0xC0);
	LCD_WriteData_Byte(0x2C);

	LCD_Write_Command(0xC2);
	LCD_WriteData_Byte(0x01);

	LCD_Write_Command(0xC3);
	LCD_WriteData_Byte(0x12);   

	LCD_Write_Command(0xC4);
	LCD_WriteData_Byte(0x20);

	LCD_Write_Command(0xC6);
	LCD_WriteData_Byte(0x0F); 

	LCD_Write_Command(0xD0);
	LCD_WriteData_Byte(0xA4);
	LCD_WriteData_Byte(0xA1);

	LCD_Write_Command(PVGAMCTRL);
	LCD_WriteData_Byte(0xD0);
	LCD_WriteData_Byte(0x08);
	LCD_WriteData_Byte(0x11);
	LCD_WriteData_Byte(0x08);
	LCD_WriteData_Byte(0x0C);
	LCD_WriteData_Byte(0x15);
	LCD_WriteData_Byte(0x39);
	LCD_WriteData_Byte(0x33);
	LCD_WriteData_Byte(0x50);
	LCD_WriteData_Byte(0x36);
	LCD_WriteData_Byte(0x13);
	LCD_WriteData_Byte(0x14);
	LCD_WriteData_Byte(0x29);
	LCD_WriteData_Byte(0x2D);

	LCD_Write_Command(NVGAMCTRL);
	LCD_WriteData_Byte(0xD0);
	LCD_WriteData_Byte(0x08);
	LCD_WriteData_Byte(0x10);
	LCD_WriteData_Byte(0x08);
	LCD_WriteData_Byte(0x06);
	LCD_WriteData_Byte(0x06);
	LCD_WriteData_Byte(0x39);
	LCD_WriteData_Byte(0x44);
	LCD_WriteData_Byte(0x51);
	LCD_WriteData_Byte(0x0B);
	LCD_WriteData_Byte(0x16);
	LCD_WriteData_Byte(0x14);
	LCD_WriteData_Byte(0x2F);
	LCD_WriteData_Byte(0x31);
	// LCD_Write_Command(INVON);
	invert(1);

	LCD_Write_Command(SLPOUT);

	LCD_Write_Command(DISPON);

}


void ST7789::update()
{
    u16 j;
    setWindow(0, 0, pixWidth-1, pixHeight-1);
    DEV_Digital_Write(DEV_DC_PIN, 1);
    for (j = 0; j < pixHeight; j++) {
        DEV_SPI_Write_nByte((uint8_t *)&pixels[j*pixWidth], pixWidth*2);
    }
}

#define XOFFSET 0
#define YOFFSET 0

void ST7789::setWindow(UWORD Xstart, UWORD Ystart, UWORD Xend, UWORD  Yend)
{ 
	if (!on)
		power(1);

	Xstart = Xstart + XOFFSET;
	Xend = Xend + XOFFSET;
	Ystart = Ystart + YOFFSET;
	Yend = Yend+YOFFSET;
	
	LCD_Write_Command(0x2a);
	LCD_WriteData_Byte(Xstart >> 8);
	LCD_WriteData_Byte(Xstart & 0xff);
	LCD_WriteData_Byte(Xend >> 8);
	LCD_WriteData_Byte(Xend & 0xff);

	LCD_Write_Command(0x2b);
	LCD_WriteData_Byte(Ystart >> 8);
	LCD_WriteData_Byte(Ystart & 0xff);
	LCD_WriteData_Byte(Yend >> 8);
	LCD_WriteData_Byte(Yend & 0xff);

	LCD_Write_Command(0x2C);
}

void ST7789::power(u8 on) {
	LCD_Write_Command(on? DISPON : DISPOFF);
	// DEV_Delay_ms (120);
	Display::power(on);
}

void ST7789::invert(u8 on) {
	LCD_Write_Command(on? INVOFF : INVON);
	Display::invert(on);
}