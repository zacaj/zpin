#pragma once
class Display;

class Manager
{
public:
    int numDisplays;
    Display** displays;
    Manager(int numDisplays);

    void updateDisplay(int num);
    void updateAll();
    
    void initAll();

    void selectDisplay(int num);
    void selectAll();
};