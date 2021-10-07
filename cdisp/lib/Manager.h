#pragma once
class Display;
#include "common.h"

class Manager
{
public:
    int numDisplays;
    Display** displays;
    Manager(int numDisplays);

    void updateDisplay(int num);
    void updateDisplays(u8* on, int num);
    void updateAll();
    
    void initAll();

    void selectDisplay(int num);
    void selectDisplays(u8* on);
    void selectAll();
};