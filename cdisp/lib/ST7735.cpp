#include "ST7735.h"
#include "../HW/DEV_Config.h"

ST7735::ST7735(int number, int width, int height, LCD_SCAN_DIR scanDir, u8 rgbOrder, ROTATE_IMAGE rotate, MIRROR_IMAGE mirror): 
    Display(number, width, height, scanDir, rotate, mirror) {
	this->rgbOrder = rgbOrder;
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
    FRMCTR1 = 0xB1, // frame rate control
    FRMCTR2 = 0xB2, // frame rate control
    FRMCTR3 = 0xB3, // frame rate control
    INVCTR = 0xB4,
    PWCTR1 = 0xC0,
    PWCTR2 = 0xC1,
    PWCTR3 = 0xC2,
    PWCTR4 = 0xC3,
    PWCTR5 = 0xC4,
    VMCTR1 = 0xC5,
    GMCTRP1 = 0xE0,
    GMCTRN1 = 0xE1,
    COLMOD = 0x3A,
    MADCTL = 0x36,
    DISPOFF = 0x28,
    DISPON = 0x29,
    CASET = 0x2A,
    RASET = 0x2B,
    RAMWR = 0x2C,
} Command;

void ST7735::init() {
    // reset
    // DEV_Delay_ms(200);
	// DEV_Digital_Write(DEV_RST_PIN, 0);
	// DEV_Delay_ms(200);
	// DEV_Digital_Write(DEV_RST_PIN, 1);
	// DEV_Delay_ms(200);

    // init
    LCD_Write_Command(SWRESET);
	DEV_Delay_ms(150);

	LCD_Write_Command(SLPOUT);//Sleep exit 
	DEV_Delay_ms (120);
	// LCD_Write_Command(INVOFF); 
	invert(0);

	LCD_Write_Command(FRMCTR1); // default frame rate
	LCD_WriteData_Byte(0x05);
	LCD_WriteData_Byte(0x3A);
	LCD_WriteData_Byte(0x3A);

	LCD_Write_Command(FRMCTR2);
	LCD_WriteData_Byte(0x05);
	LCD_WriteData_Byte(0x3A);
	LCD_WriteData_Byte(0x3A);

	LCD_Write_Command(FRMCTR3); 
	LCD_WriteData_Byte(0x05);  
	LCD_WriteData_Byte(0x3A);
	LCD_WriteData_Byte(0x3A);
	LCD_WriteData_Byte(0x05);
	LCD_WriteData_Byte(0x3A);
	LCD_WriteData_Byte(0x3A);

	LCD_Write_Command(INVCTR); // default inversion
	LCD_WriteData_Byte(0x03);

	LCD_Write_Command(PWCTR1); // voltage settings
	LCD_WriteData_Byte(0x62);
	LCD_WriteData_Byte(0x02);
	LCD_WriteData_Byte(0x04);

	LCD_Write_Command(PWCTR2);
	LCD_WriteData_Byte(0xC0);

	LCD_Write_Command(PWCTR3);
	LCD_WriteData_Byte(0x0D);
	LCD_WriteData_Byte(0x00);

	LCD_Write_Command(PWCTR4);
	LCD_WriteData_Byte(0x8D);
	LCD_WriteData_Byte(0x6A);   

	LCD_Write_Command(PWCTR5);
	LCD_WriteData_Byte(0x8D); 
	LCD_WriteData_Byte(0xEE); 

	LCD_Write_Command(VMCTR1);  
	LCD_WriteData_Byte(0x0E);    

	LCD_Write_Command(GMCTRP1); // gamma settings
	LCD_WriteData_Byte(0x10);
	LCD_WriteData_Byte(0x0E);
	LCD_WriteData_Byte(0x02);
	LCD_WriteData_Byte(0x03);
	LCD_WriteData_Byte(0x0E);
	LCD_WriteData_Byte(0x07);
	LCD_WriteData_Byte(0x02);
	LCD_WriteData_Byte(0x07);
	LCD_WriteData_Byte(0x0A);
	LCD_WriteData_Byte(0x12);
	LCD_WriteData_Byte(0x27);
	LCD_WriteData_Byte(0x37);
	LCD_WriteData_Byte(0x00);
	LCD_WriteData_Byte(0x0D);
	LCD_WriteData_Byte(0x0E);
	LCD_WriteData_Byte(0x10);

	LCD_Write_Command(GMCTRN1);
	LCD_WriteData_Byte(0x10);
	LCD_WriteData_Byte(0x0E);
	LCD_WriteData_Byte(0x03);
	LCD_WriteData_Byte(0x03);
	LCD_WriteData_Byte(0x0F);
	LCD_WriteData_Byte(0x06);
	LCD_WriteData_Byte(0x02);
	LCD_WriteData_Byte(0x08);
	LCD_WriteData_Byte(0x0A);
	LCD_WriteData_Byte(0x13);
	LCD_WriteData_Byte(0x26);
	LCD_WriteData_Byte(0x36);
	LCD_WriteData_Byte(0x00);
	LCD_WriteData_Byte(0x0D);
	LCD_WriteData_Byte(0x0E);
	LCD_WriteData_Byte(0x10);

	LCD_Write_Command(COLMOD); // pixel format
	LCD_WriteData_Byte(0x05);

	// LCD_Write_Command(MADCTL); // data access control
	// LCD_WriteData_Byte(0xA8);
	setScanDir(scanDir);

	LCD_Write_Command(DISPON); // turn on display

	clearDisp(BLUE);
}

void ST7735::setScanDir(LCD_SCAN_DIR Scan_dir)
{
    //Get the screen scan direction
    scanDir = Scan_dir;

	//Get GRAM and LCD width and height
	// if(Scan_dir == L2R_U2D || Scan_dir == L2R_D2U || Scan_dir == R2L_U2D || Scan_dir == R2L_D2U){
	// 	pixWidth	= width;
	// 	pixHeight = height ;	
	// 	// sLCD_DIS.LCD_X_Adjust = LCD_X;
	// 	// sLCD_DIS.LCD_Y_Adjust = LCD_Y;
	// }else{	
	// 	pixWidth	= height;
	// 	pixHeight = width ;		
	// 	// sLCD_DIS.LCD_X_Adjust = LCD_Y;
	// 	// sLCD_DIS.LCD_Y_Adjust = LCD_X;
	// }

    // Gets the scan direction of GRAM
    uint16_t MemoryAccessReg_Data=0;  //0x36
    switch (Scan_dir) {
    case L2R_U2D:
        MemoryAccessReg_Data = 0X00 | 0x00;//x Scan direction | y Scan direction
        break;
    case L2R_D2U:
        MemoryAccessReg_Data = 0x00 | 0x80;//0xC8 | 0X10
        break;
    case R2L_U2D://	0X4
        MemoryAccessReg_Data = 0x40 | 0x00;
        break;
    case R2L_D2U://	0XC
        MemoryAccessReg_Data = 0x40 | 0x80;
        break;
    case U2D_L2R://0X2
        MemoryAccessReg_Data = 0X00 | 0X00 | 0x20;
        break;
    case U2D_R2L://0X6
        MemoryAccessReg_Data = 0x00 | 0X40 | 0x20;
        break;
    case D2U_L2R://0XA
        MemoryAccessReg_Data = 0x80 | 0x00 | 0x20;
        break;
    case D2U_R2L://0XE
        MemoryAccessReg_Data = 0x40 | 0x80 | 0x20;
        break;
    }

    // Set the read / write scan direction of the frame memory
    LCD_Write_Command(MADCTL); //MX, MY, RGB mode
#if defined(LCD_1IN44)
    // LCD_WriteData_Byte( MemoryAccessReg_Data | 0x08);	//0x08 set RGB
#elif defined(LCD_1IN8)
    // LCD_WriteData_Byte( MemoryAccessReg_Data & 0xf7);	//RGB color filter panel
#endif
	if (this->rgbOrder)
		LCD_WriteData_Byte( MemoryAccessReg_Data | 0x08);	//RGB color filter panel
	else
    	LCD_WriteData_Byte( MemoryAccessReg_Data & 0xf7);	//RGB color filter panel

}

void ST7735::update()
{
    u16 j;
    setWindow(0, 0, pixWidth-1, pixHeight-1);
    DEV_Digital_Write(DEV_DC_PIN, 1);
    for (j = 0; j < pixHeight; j++) {
        DEV_SPI_Write_nByte((uint8_t *)&pixels[j*pixWidth], pixWidth*2);
    }
}

void ST7735::setWindow(UWORD Xstart, UWORD Ystart, UWORD Xend, UWORD  Yend)
{ 
	if (!on)
		power(1);
	Xstart = Xstart + xOffset;
	Xend = Xend + xOffset;
	Ystart = Ystart + yOffset;
	Yend = Yend+yOffset;
	
	LCD_Write_Command(CASET);
	LCD_WriteData_Byte(Xstart >> 8);
	LCD_WriteData_Byte(Xstart);
	LCD_WriteData_Byte(Xend >> 8);
	LCD_WriteData_Byte(Xend );

	LCD_Write_Command(RASET);
	LCD_WriteData_Byte(Ystart >> 8);
	LCD_WriteData_Byte(Ystart);
	LCD_WriteData_Byte(Yend >> 8);
	LCD_WriteData_Byte(Yend);

	LCD_Write_Command(RAMWR);
}

void ST7735::clearDisp(Color color) {
    color = ((color<<8)&0xff00)|((color>>8)&0xff);
	u16* row = new u16[pixWidth];
	for (int i=0; i<pixWidth; i++)
		row[i] = color;
    setWindow(0, 0, pixWidth-1, pixHeight-1);
    DEV_Digital_Write(DEV_DC_PIN, 1);
	for (int j=0; j<pixHeight; j++) {
        DEV_SPI_Write_nByte((uint8_t *)row, pixWidth*2);
	}
}

void ST7735::power(u8 on) {
	LCD_Write_Command(on? DISPON : DISPOFF);
	// DEV_Delay_ms (120);
	Display::power(on);
}

void ST7735::invert(u8 on) {
	LCD_Write_Command(!on? INVOFF : INVON);
	Display::invert(on);
}