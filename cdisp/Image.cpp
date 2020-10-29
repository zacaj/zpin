#include "Image.h"

#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

Image::Image(const char* path) {
    int w,h;
    int channels;
    float* pixels = stbi_loadf(path, &w, &h, &channels, 3);
    printf("loaded %ix%i image '%s' with %i channels\n", w, h, path, channels);
    assert(channels == 3);
    unsigned char* image = new unsigned char[w*h*2];
    for (int x=0; x<w; x++)
        for (int y=0; y<h; y++) {
            int i = x+y*w;
            unsigned char r = pixels[i*3+0]*31;
            unsigned char g = pixels[i*3+1]*63;
            unsigned char b = pixels[i*3+2]*31;

            int j = i;
            image[j*2+1] = (r<<3)|(g>>3);
            image[j*2+0] = (g<<5)|(b>>0); 
        }

    width = w;
    height = h;
    this->pixels = (u16*) image;
}