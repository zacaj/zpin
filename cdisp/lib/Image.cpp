#include "Image.h"
#include <stdexcept>
#include <string>
#include "common.h"

#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

Image::Image(const char* path) {
    int w,h;
    int channels;
    float* pixels = stbi_loadf(path, &w, &h, &channels, 4);
    if (!pixels) throw std::runtime_error(std::string("unable to load image ")+path);
    printf("loaded %ix%i image '%s' with %i channels\n", w, h, path, channels);
    assert(channels == 3 || channels == 4);
    unsigned char* image = new unsigned char[w*h*2];
    for (int x=0; x<w; x++)
        for (int y=0; y<h; y++) {
            int i = x+y*w;
            unsigned char r = pixels[i*4+0]*255;
            unsigned char g = pixels[i*4+1]*255;
            unsigned char b = pixels[i*4+2]*255;
            unsigned char a = pixels[i*4+3]*255;

            int j = i;
// #ifdef _MSC_VER 
//             image[j*2+0] = makeRG(r,g);
//             image[j*2+1] = makeGB(g,b);
// #else 
            u8 rg = makeRG(r, g);
            u8 gb = makeGB(g, b);
            image[j*2+0] = rg;
            image[j*2+1] = gb; 
// #endif
        }

    width = w;
    height = h;
    this->pixels = (u16*) image;

    stbi_image_free(pixels);
}

Color Image::getColor(u16 x, u16 y) {
    return pixels[x+y*width];
}