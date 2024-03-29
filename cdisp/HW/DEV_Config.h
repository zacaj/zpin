/*****************************************************************************
* | File      	:   DEV_Config.h
* | Author      :   Waveshare team
* | Function    :   Hardware underlying interface
* | Info        :
*                Used to shield the underlying layers of each master 
*                and enhance portability
*----------------
* |	This version:   V1.0
* | Date        :   2019-07-11
* | Info        :   Basic version
*
******************************************************************************/
#ifndef _DEV_CONFIG_H_
#define _DEV_CONFIG_H_

#include "Debug.h"

#ifdef USE_BCM2835_LIB
    #include <bcm2835.h>
#elif USE_WIRINGPI_LIB
    #include <wiringPi.h>
    #include <wiringPiSPI.h>
#elif USE_DEV_LIB
    #include "sysfs_gpio.h"
    #include "dev_hardware_SPI.h"
    #include <unistd.h>
#endif

#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <stdint.h>
/* J6
        black
        white
        orange - SCL
        blue - SDA
        grey - RST
        pink - DC
        orange - 1
        not used
        blue - 4
        purple - 5
        pink - 6
        brown - 7

    J1
        black
        white
        orange - SCL
        blue - SDA
        grey - RST
        pink - DC
        not used
        not used
        red - 0
        orange - 1
        yellow - 2
        green - 3
        */
/**
 * data
**/
#define UBYTE   uint8_t
#define UWORD   uint16_t
#define UDOUBLE uint32_t

//SPI
//#define SPI_MISO 9
//#define SPI_MOSI 10
//#define SPI_SCK  11

// pin 19: blue, MOSI ser data
// pin 23: yellow, ser clock (orange)

//GPIO config
#define DEV_RST_PIN     27 // pin 13, grey
#define DEV_DC_PIN      22 // pin 15, green (pink)
//#define DEV_CS_PIN      8  // pin 24, brown
#define DEV_BL_PIN      18

#define DEV_CS_CLK_PIN 3 // pin 5, purple
#define DEV_CS_DAT_PIN 4 // pin 7, brown
#define DEV_3V_PIN 17 // pin 11, white

/*------------------------------------------------------------------------------------------------------*/
UBYTE DEV_ModuleInit(void);
void DEV_ModuleExit(void);

void DEV_GPIO_Mode(UWORD Pin, UWORD Mode);
void DEV_Digital_Write(UWORD Pin, UBYTE Value);
UBYTE DEV_Digital_Read(UWORD Pin);
void DEV_Delay_ms(UDOUBLE xms);

void DEV_SPI_WriteByte(UBYTE Value);
void DEV_SPI_Write_nByte(uint8_t *pData, uint32_t Len);

#endif
