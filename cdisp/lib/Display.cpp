#include "Display.h"
#include "Image.h"
#include "../HW/Debug.h"
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"
#define STB_TRUETYPE_IMPLEMENTATION
#include "../lib/stb_truetype.h"

stbtt_fontinfo font;

Display::Display(int number, int width, int height, LCD_SCAN_DIR scanDir, ROTATE_IMAGE rotate, MIRROR_IMAGE mirror)
: number(number), pixWidth(width), pixHeight(height), scanDir(scanDir), mirror(mirror), rotate(rotate), on(1), inverted(0) {
    pixels = new u16[width*height];

    if (rotate == ROTATE_0 || rotate == ROTATE_180) {
        this->width = width;
        this->height = height;
    } else {
        this->width = height;
        this->height = width;
    }

    clear(MAGENTA);
}

void Display::loadFont() {
    unsigned char* ttf_buffer;  
    FILE* fp = fopen("media/CardCharacters.ttf", "rb");
    fseek(fp, 0, SEEK_END);
    size_t size = ftell(fp);
    ttf_buffer = new u8[size];
    fseek(fp, 0, SEEK_SET);
    fread(ttf_buffer, 1, size, fp);
    fclose(fp);
    stbtt_InitFont(&font, ttf_buffer, 0);
}

void Display::clear(Color color) {
    // color = ((color<<8)&0xff00)|(color>>8);
    for (int i=0; i<width*height; i++)
        pixels[i] = color;
}

void Display::setPixel(u16 Xpoint, u16 Ypoint, Color Color)
{
    // if(Xpoint > width || Ypoint > height){
    //     DEBUG("Exceeding display boundaries\r\n");
    //     return;
    // }      
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
        // DEBUG("Exceeding display boundaries\r\n");
        return;
    }
    // Color = ((Color<<8)&0xff00)|(Color>>8);
    int Addr = X  + Y * pixWidth;
    pixels[Addr] = Color;
}

Color Display::getPixel(u16 Xpoint, u16 Ypoint)
{
    // if(Xpoint > width || Ypoint > height){
    //     DEBUG("Exceeding display boundaries\r\n");
    //     return RED;
    // }      
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
        return RED;
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
        return RED;
    }

    if(X > pixWidth || Y > pixHeight){
        // DEBUG("Exceeding display boundaries\r\n");
        return RED;
    }
    int Addr = X  + Y * pixWidth;
    return pixels[Addr];
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
				if(xStart+i < width  &&  yStart+j < height) {//Exceeded part does not display
                    Color color = image->getColor(i, j);    
#ifndef _MSC_VER
                    color = ((color<<8)&0xff00)|(color>>8);
#endif
                    u8 r = getR(color);
                    u8 g = getG(color);
                    u8 b = getB(color);
                    if (r >= 224 && g <= 16 && b >= 224)
                        continue; 
#ifndef _MSC_VER
                    color = ((color<<8)&0xff00)|(color>>8);
#endif
                    // if (color == makeRGB(255,0,255))
                    //     continue;
                    setPixel(xStart+i, yStart+j, color);
                }
					// setPixel(xStart + i, yStart + j, (*(image->pixels + j*image->width + i+1))<<8 | (*(image->pixels + j*image->height + i)));
				//Using arrays is a property of sequential storage, accessing the original array by algorithm
				//j*W_Image*2 			   Y offset
				//i*2              	   X offset
			}
		}
      
}

// size = including descenders below baseline
void Display::drawText(const char* text, int sx, int sy, int size, VALIGN vAlign, u8 thresh) {
    int i,j,ascent,baseline,ch=0;
    float scale, xpos = 0;    
    scale = stbtt_ScaleForPixelHeight(&font, size);
    stbtt_GetFontVMetrics(&font, &ascent,0,0);
    baseline = (int) (ascent*scale); // distance from top to baseline

    if (vAlign == TOP) sy+=baseline;
    if (vAlign == CENTER_ASC) sy+=baseline-size/2;
    if (vAlign == BOTTOM) sy+=baseline-size;
    if (vAlign == CENTER_ALL) sy+=baseline/2;

    while (text[ch]) {
        int advance,lsb;
        float x_shift = xpos - (float) floor(xpos);
        stbtt_GetCodepointHMetrics(&font, text[ch], &advance, &lsb);
        int width, height, xOff, yOff;
        unsigned char* buffer = stbtt_GetCodepointBitmapSubpixel(&font,scale,scale,x_shift,0, text[ch], &width, &height, &xOff, &yOff);
        // yOff is relative to baseline
        
        for (int x=0; x<width; x++)
            for (int y=0; y<height; y++) {
                Color oldColor = this->getPixel(sx+x+xpos+xOff, sy+y+yOff);
                // u8 r = (oldColor&RED)>>8;
                // u8 g = ((oldColor&GREEN)>>6)<<2;
                // u8 b = (oldColor&BLUE)<<3;
                u8 r = getR(oldColor);
                u8 g = getG(oldColor);
                u8 b = getB(oldColor);
                u8 c = buffer[x+(y)*width];
                r = c>thresh? c : r;
                g = c>thresh? c : g;
                b = c>thresh? c : b;
                // Color newColor = (r<<8)|(g<<3)|(b>>3);
                Color newColor = makeRGB(r,g,b);
                this->setPixel(sx+x+xpos+xOff, sy+y+yOff, newColor);
            }

        delete buffer;
        
        xpos += (advance * scale);
        if (text[ch+1])
            xpos += scale*stbtt_GetCodepointKernAdvance(&font, text[ch],text[ch+1]);
        ++ch;
    }
}

void Display::savePng(const char* path) {
    u8* image = new u8[pixWidth*pixHeight*3];
    u8* img = image;
    u16* disp = pixels;
    for (int i=0; i<pixWidth*pixHeight; i++) {
        Color c = *disp;
#ifdef _MSC_VER
        c = ((c<<8)&0xff00)|(c>>8);
#endif
        // img[0] = (*disp>>11)<<3;
        // img[1] = ((*disp>>5)&0x3f)<<2;
        // img[2] = ((*disp)&0x1f)<<3;
        u8 r = img[0] = getR(c);
        u8 g = img[1] = getG(c);
        u8 b = img[2] = getB(c);
        img+=3;
        disp++;
    }

    stbi_write_png(path, pixWidth, pixHeight, 3, image, 0);
    delete[] image;
}

void Display::power(u8 on) {
	this->on = on;
}

void Display::invert(u8 on) {
	this->inverted = on;
}