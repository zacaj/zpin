#include "Display.h"
#include "Image.h"
#include "../HW/Debug.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

Display::Display(int number, int width, int height, LCD_SCAN_DIR scanDir, MIRROR_IMAGE mirror, ROTATE_IMAGE rotate)
: number(number), pixWidth(width), pixHeight(height), scanDir(scanDir), mirror(mirror), rotate(rotate) {
    pixels = new u16[width*height];
    clear(MAGENTA);

    if (rotate == ROTATE_0 || rotate == ROTATE_180) {
        this->width = width;
        this->height = height;
    } else {
        this->width = height;
        this->height = width;
    }
}

void Display::clear(Color color) {
    for (int i=0; i<width*height; i++)
        pixels[i] = color;
}

void Display::setPixel(u16 Xpoint, u16 Ypoint, Color Color)
{
    if(Xpoint > width || Ypoint > height){
        DEBUG("Exceeding display boundaries\r\n");
        return;
    }      
    u16 X, Y;

    switch(rotate) {
    case 0:
        X = Xpoint;
        Y = Ypoint;  
        break;
    case 90:
        X = pixWidth - Ypoint - 1;
        Y = Xpoint;
        break;
    case 180:
        X = pixWidth - Xpoint - 1;
        Y = pixHeight - Ypoint - 1;
        break;
    case 270:
        X = Ypoint;
        Y = pixHeight - Xpoint - 1;
        break;
    default:
        return;
    }
    
    switch(mirror) {
    case MIRROR_NONE:
        break;
    case MIRROR_HORIZONTAL:
        X = pixWidth - X - 1;
        break;
    case MIRROR_VERTICAL:
        Y = pixHeight - Y - 1;
        break;
    case MIRROR_ORIGIN:
        X = pixWidth - X - 1;
        Y = pixHeight - Y - 1;
        break;
    default:
        return;
    }

    if(X > pixWidth || Y > pixHeight){
        DEBUG("Exceeding display boundaries\r\n");
        return;
    }
    Color = ((Color<<8)&0xff00)|(Color>>8);
    int Addr = X  + Y * pixWidth;
    pixels[Addr] = Color;
}

void Display::drawRect(u16 x1, u16 y1, u16 x2, u16 y2, Color color) {
    for (int i=x1; i<=x2; i++)
        for (int j=y1; j<y2; j++)
            setPixel(i, j, color);
}

void Display::drawImage(Image* image, u16 xStart, u16 yStart) 
{
    int i,j; 
		for(j = 0; j < image->height; j++){
			for(i = 0; i < image->width; i++){
				if(xStart+i < width  &&  yStart+j < height)//Exceeded part does not display
                    setPixel(xStart+i, yStart+j, image->getColor(i, j));
					// setPixel(xStart + i, yStart + j, (*(image->pixels + j*image->width + i+1))<<8 | (*(image->pixels + j*image->height + i)));
				//Using arrays is a property of sequential storage, accessing the original array by algorithm
				//j*W_Image*2 			   Y offset
				//i*2              	   X offset
			}
		}
      
}

void Display::savePng(const char* path) {
    u8* image = new u8[pixWidth*pixHeight*3];
    u8* img = image;
    u16* disp = pixels;
    for (int i=0; i<pixWidth*pixHeight; i++) {
        img[0] = (*disp>>11)<<3;
        img[1] = ((*disp>>5)&0x3f)<<2;
        img[2] = ((*disp)&0x1f)<<3;
        img+=3;
        disp++;
    }

    stbi_write_png(path, pixWidth, pixHeight, 3, image, 0);
    delete image;
}