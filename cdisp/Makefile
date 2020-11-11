#DIR_FONTS = ./Fonts
#DIR_CONFIG = ./obj/Config
#DIR_Drive = ./obj/LCD
#DIR_GUI = ./obj/GUI
#DIR_OBJ = ./obj
DIR_HW = ./HW
DIR_BIN = ./bin
DIR_LIB = ./lib

OBJ_C = $(wildcard ${DIR_HW}/*.cpp ${DIR_LIB}/*.cpp)
OBJ_O = $(patsubst %.cpp,${DIR_BIN}/%.o,$(notdir ${OBJ_C}))

#BIN_TARGET = ${DIR_BIN}/${TARGET}

CC = g++

DEBUG = -g #-O3 -Wall
CFLAGS = $(DEBUG)

TARGET = $(patsubst %.cpp,%,$(wildcard ./*.cpp))

# USELIB = USE_BCM2835_LIB
# USELIB = USE_WIRINGPI_LIB
USELIB = USE_DEV_LIB
DEBUG += -D $(USELIB)
LIB = -lm
ifeq ($(USELIB), USE_BCM2835_LIB)
    LIB = -lbcm2835 -lm 
else ifeq ($(USELIB), USE_WIRINGPI_LIB)
    LIB = -lwiringPi -lm 
endif

all: ${TARGET}

${TARGET}: ${OBJ_O} $(patsubst %.cpp,${DIR_BIN}/%.o,$(wildcard ./*.cpp))
	$(CC) $(CFLAGS) $(OBJ_O) ${DIR_BIN}/$@.o -o $@ $(LIB) 

${DIR_BIN}/%.o: $(DIR_HW)/%.cpp 
	$(CC) $(CFLAGS) -c  $< -o $@ $(LIB) 

${DIR_BIN}/%.o: $(DIR_LIB)/%.cpp 
	$(CC) $(CFLAGS) -c  $< -o $@ $(LIB) 

${DIR_BIN}/%.o: ./%.cpp
	$(CC) $(CFLAGS) -c  $< -o $@ $(LIB) 

clean :
	rm -fv $(DIR_BIN)/*.* 
	rm -fv $(TARGET)

debug:
	echo ${OBJ_C}
	echo ${OBJ_O}