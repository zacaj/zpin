#include "Display.h"
#include "Image.h"
#include "HW/Debug.h"

Display::Display(int number, int width, int height, MIRROR_IMAGE mirror, ROTATE_IMAGE rotate)
: number(number), width(width), height(height), mirror(mirror), rotate(rotate) {
    pixels = new u16[width*height];
    clear(MAGENTA);

    if (rotate == ROTATE_0 || rotate == ROTATE_180) {
        pixWidth = width;
        pixHeight = height;
    } else {
        pixWidth = height;
        pixHeight = width;
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

void Display::drawImage(Image* image, u16 xStart, u16 yStart) 
{
    int i,j; 
		for(j = 0; j < image->height; j++){
			for(i = 0; i < image->width; i++){
				if(xStart+i < width  &&  yStart+j < height)//Exceeded part does not display
					setPixel(xStart + i, yStart + j, (*(image->pixels + j*image->width*2 + i*2+1))<<8 | (*(image->pixels + j*image->height*2 + i*2)));
				//Using arrays is a property of sequential storage, accessing the original array by algorithm
				//j*W_Image*2 			   Y offset
				//i*2              	   X offset
			}
		}
      
}
