#include <stdio.h>
#include <sys/socket.h> 
#include <netinet/in.h> 
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include "lib/common.h"
#include "lib/Manager.h"
#include "lib/Disp128.h"
#include "lib/Disp160.h"
#include "lib/Image.h"
#include "HW/DEV_Config.h"
#include <string>
#include <vector>
#include <iostream>
#include <map>
#include <signal.h>
#include <exception>

using namespace std;

map<string, Image*> images;

Image* getImage(string path) {
    if (images.find(path) == images.end()) {
        images[path] = new Image(path.c_str());
    }
    return images[path];
}

vector<string> split(string phrase, string delimiter){
    vector<string> list;
    string s = string(phrase);
    size_t pos = 0;
    string token;
    while ((pos = s.find(delimiter)) != string::npos) {
        token = s.substr(0, pos);
        list.push_back(token);
        s.erase(0, pos + delimiter.length());
    }
    list.push_back(s);
    return list;
}

Color toColor(const char* str) {
    u16 r, g, b;
    sscanf(str, "%2hx%2hx%2hx", &r, &g, &b);

    r = r >> 3;
    g = g >> 2;
    b = b >> 3;
    
    u16 c = 0;
    c |= ((r<<3)|(g>>3)) << 8;
    c |= ((g<<5)|(b>>0))&0xFF;

    return c; 
}

Manager manager(7*8);

void clearAll(Color color) {
    for (int i=0; i<manager.numDisplays; i++) {
        if (manager.displays[i]) {
            manager.displays[i]->clear(color);
        }
    }
    manager.updateAll();
}

u8 power = 0;
void checkPower() {
    return;
    u8 now = DEV_Digital_Read(DEV_3V_PIN);
    // printf("power: %i\n", now);
    if (now && !power) {
        printf("power detected\n");
        fflush(stdout);
        usleep(2000000);
        manager.initAll();
    }
    else if (!now && power) {
        printf("power lost!\n");
    }
    power = now;
}

int main() {
    printf("Starting C server\n"); 
    int server_fd, new_socket, valread; 
    struct sockaddr_in address; 
    int opt = 1; 
    int addrlen = sizeof(address); 

     // Creating socket file descriptor 
    if ((server_fd = socket(AF_INET, SOCK_STREAM|SOCK_NONBLOCK, 0)) == 0) 
    { 
        perror("socket failed"); 
        exit(1); 
    } 

    signal(SIGPIPE, SIG_IGN);

       
    // Forcefully attaching socket to the port 8080 
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR | SO_REUSEPORT, 
                                                  &opt, sizeof(opt))) 
    { 
        perror("setsockopt"); 
        exit(1); 
    } 
    address.sin_family = AF_INET; 
    address.sin_addr.s_addr = INADDR_ANY; 
    address.sin_port = htons( 2909 ); 
       
    // Forcefully attaching socket to the port 8080 
    if (bind(server_fd, (struct sockaddr *)&address,  
                                 sizeof(address))<0) 
    { 
        perror("bind failed"); 
        exit(1); 
    } 
    if (listen(server_fd, 3) < 0) 
    { 
        perror("listen failed"); 
        exit(1); 
    } 

	if(DEV_ModuleInit() != 0){
        DEV_ModuleExit();
        return 1;
    } 

    /*

        4 bank plexer:
            4: 4 bank 1  (J6)
            5: 4 bank 2
            6: 4 bank 3
            7: 4 bank 4

        5 bank plexer:
            0: shooter 1 (J1) (160)
            1: 5 bank 1 (J6)
            4: 5 bank 2
            5: 5 bank 3
            6: 5 bank 4
            7: 5 bank 5

        spinner plexer:
            0: spinner 160 (J1)
            1: shooter 3 (J6)

        upper plexer:
            0: eject 160 (J1)
            1: lanes 160 (J6)

        upper banks plexer:
            2: 2 bank 1 (J1)
            3: 2 bank 2
            5: 3 bank 3 (J6)
            6: 3 bank 2
            7: 3 bank 1

        left side plexer:
            0: ramp 160 (J1)
            1: left inlane (J6)

        center bank plexer: (last, old board)
            1: center 1 (J6)
            4: center 2
            5: center 3

    */

#define CenterPlex(n) 48+n
#define LeftPlex(n) 0+n
#define UpperBanksPlex(n) 32+n
#define RightPlex(n) 8+n
#define SpinnerPlex(n) 16+n
#define UpperPlex(n) 24+n
#define LeftSidePlex(n) 40+n
    manager.displays[CenterPlex(1)] = new Disp128(1, ROTATE_180); // Center 1
    manager.displays[CenterPlex(1)]->loadFont(); // Center 1
    manager.displays[CenterPlex(4)] = new Disp128(4, ROTATE_180); // center 2
    manager.displays[CenterPlex(5)] = new Disp128(5, ROTATE_180); // center 3 
    // manager.displays[LeftPlex(0)] = new Disp128(4, ROTATE_180); // left 1f
    // manager.displays[LeftPlex(1)] = new Disp128(4, ROTATE_180); // left 1f
    // manager.displays[LeftPlex(2)] = new Disp128(4, ROTATE_180); // left 1f
    // manager.displays[LeftPlex(3)] = new Disp128(4, ROTATE_180); // left 1f
    manager.displays[LeftPlex(4)] = new Disp128(4, ROTATE_180); // left 1
    manager.displays[LeftPlex(5)] = new Disp128(5, ROTATE_180); // left 2
    manager.displays[LeftPlex(6)] = new Disp128(6, ROTATE_180); // left 3 
    manager.displays[LeftPlex(7)] = new Disp128(7, ROTATE_180); // left 4
    manager.displays[RightPlex(0)] = new Disp160(0, ROTATE_0); // shooter 1
    manager.displays[RightPlex(1)] = new Disp128(1, ROTATE_0); // right 1
    // manager.displays[RightPlex(2)] = new Disp128(4, ROTATE_0); // right 2f
    // manager.displays[RightPlex(3)] = new Disp128(4, ROTATE_0); // right 2f
    manager.displays[RightPlex(4)] = new Disp128(4, ROTATE_0); // right 2
    manager.displays[RightPlex(5)] = new Disp128(5, ROTATE_0); // right 3
    manager.displays[RightPlex(6)] = new Disp128(6, ROTATE_0); // right 4 
    manager.displays[RightPlex(7)] = new Disp128(7, ROTATE_0); // right 5
    // manager.displays[UpperBanksPlex(0)] = new Disp128(1, ROTATE_0); // shooter 1f
    // manager.displays[UpperBanksPlex(1)] = new Disp128(1, ROTATE_0); // shooter 1f
    manager.displays[UpperBanksPlex(2)] = new Disp128(2, ROTATE_0); // left 1
    manager.displays[UpperBanksPlex(3)] = new Disp128(3, ROTATE_0); // left 2
    // manager.displays[UpperBanksPlex(4)] = new Disp128(3, ROTATE_0); // left 2f
    manager.displays[UpperBanksPlex(5)] = new Disp128(5, ROTATE_180); // right 3
    manager.displays[UpperBanksPlex(6)] = new Disp128(6, ROTATE_180); // right 2
    manager.displays[UpperBanksPlex(7)] = new Disp128(7, ROTATE_180); // right 1
    manager.displays[SpinnerPlex(0)] = new Disp160(0, ROTATE_90); // spinner
    manager.displays[SpinnerPlex(1)] = new Disp128(1, ROTATE_0); // shooter 3
    manager.displays[UpperPlex(0)] = new Disp160(0, ROTATE_90); // eject
    manager.displays[UpperPlex(1)] = new Disp160(1, ROTATE_90); // lanes
    manager.displays[LeftSidePlex(0)] = new Disp160(0, ROTATE_270); // ramp
    manager.displays[LeftSidePlex(1)] = new Disp128(1, ROTATE_180); // left inlane

    // manager.displays[LeftSidePlex(0)] = new Disp128(4, ROTATE_180); // left 1
    // manager.displays[LeftSidePlex(1)] = new Disp128(4, ROTATE_180); // left 1
    // manager.displays[LeftSidePlex(2)] = new Disp128(4, ROTATE_180); // left 1
    // manager.displays[LeftSidePlex(3)] = new Disp128(4, ROTATE_180); // left 1
    // manager.displays[LeftSidePlex(4)] = new Disp128(4, ROTATE_180); // left 1
    // manager.displays[LeftSidePlex(5)] = new Disp128(5, ROTATE_180); // left 2
    // manager.displays[LeftSidePlex(6)] = new Disp128(6, ROTATE_180); // left 3 
    // manager.displays[LeftSidePlex(7)] = new Disp128(7, ROTATE_180); // left 4

    // reset all
	// DEV_Digital_Write(DEV_RST_PIN, 1);
	// DEV_Delay_ms(200);


    // // clear selects to high
    // DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    // // DEV_Delay_ms(10);
    // DEV_Digital_Write(DEV_CS_DAT_PIN, 1);
    // // DEV_Delay_ms(10);
    // for (int i=0; i<manager.numDisplays+2; i++) {   
    //     DEV_Digital_Write(DEV_CS_CLK_PIN, 1);
    //     // DEV_Delay_ms(10);
    //     DEV_Digital_Write(DEV_CS_CLK_PIN, 0);
    // }


    printf("server ready\n");

    while (true) {
        connWait:
        checkPower();
        if ((new_socket = accept(server_fd, (struct sockaddr *)&address, (socklen_t*)&addrlen)) < 0) 
        { 
            int err = errno;
            if (err == EAGAIN || err == EWOULDBLOCK) {
                usleep(500000);
                // printf("waiting for connectoin...\n");
                printf("x");
                fflush(stdout);
                goto connWait;
            }
            printf("accept fail %i\n", err); 
            exit(1); 
        } 
        printf("Incoming connection...\n");
        fflush(stdout);
        FILE* r = fdopen(dup(new_socket), "r");
        FILE* w = fdopen(dup(new_socket), "w");

        fprintf(w, "owo.\n");
        fflush(w);

        char version[100];
        fgets(version, 100, r);
        // fscanf(r, "%s\n", version);

        if (strncmp(version, "1", 1) != 0) {
            printf("got invalid version %s\n", version);
            fclose(r);
            fclose(w);
            shutdown(new_socket, SHUT_RDWR);
            close(new_socket);
            continue;
        }
        fprintf(w, "200\n");
        fflush(w);
        printf("Connected\n");

        clearAll(BLACK);

        while(true) {
            string resp = "200";
            string seq = "0 ";

            try {
                char _cmd[1000];
                // fprintf(w, "> ");
                // fflush(w);
                checkPower();
                fgets(_cmd, 1000, r);
                if (feof(r))
                    break;
                _cmd[strcspn(_cmd, "\r\n")] = 0;
                printf("got command '%s'\n", _cmd);

                string cmd(_cmd);

                if (cmd[0] == '#') {
                    seq = cmd.substr(1, cmd.find(' '));
                    cmd = cmd.substr(1+seq.length());
                } 

                vector<string> parts = split(cmd, " ");

                if (parts[0] == "q") {
                    printf("  end session\n");
                    break;
                } else if (parts[0] == "init") {
                    printf("  init displays\n");
                    manager.initAll();
                } else if (parts[0] == "clear") {
                    int disp = stoi(parts[1]);
                    Color color = toColor(parts[2].c_str());
                    printf("  clear disp %i to 0x%x\n", disp, color);
                    manager.displays[disp]->clear(color);
                    if (parts.back() != "&") manager.updateDisplay(disp);
                } else if (parts[0] == "power") {
                    int disp = stoi(parts[1]);
                    u8 on = parts[2] == "true";
                    printf("  power disp %i to %i\n", disp, on);
                    manager.selectDisplay(disp);
                    manager.displays[disp]->power(on);
                } else if (parts[0] == "invert") {
                    int disp = stoi(parts[1]);
                    u8 on = parts[2] == "true";
                    printf("  invert disp %i to %i\n", disp, on);
                    manager.selectDisplay(disp);
                    manager.displays[disp]->invert(on);
                } else if (parts[0] == "file") {
                    int disp = stoi(parts[1]);
                    string path = cmd.substr(cmd.find(parts[1])+parts[1].length()+1);
                    printf("  blit image '%s' to disp %i\n", path.c_str(), disp);
                    manager.displays[disp]->drawImage(getImage(path));
                    if (parts.back() != "&") manager.updateDisplay(disp);
                } else if (parts[0] == "image") {
                    int disp = stoi(parts[1]);
                    string name = cmd.substr(cmd.find(parts[1])+parts[1].length()+1);
                    size_t endPos = name.find_last_not_of("& ");
                    if (endPos != string::npos)
                        name = name.substr(0, endPos+1);
                    char path[1000];
                    sprintf(path, "media/%i/%s.png", max(manager.displays[disp]->width, manager.displays[disp]->height), name.c_str());
                    printf("  blit image '%s' to disp %i\n", path, disp);
                    manager.displays[disp]->drawImage(getImage(string(path)));
                    if (parts.back() != "&") manager.updateDisplay(disp);
                } else if (parts[0] == "text") {
                    int disp = stoi(parts[1]);
                    int x = stoi(parts[2]);
                    int y = stoi(parts[3]);
                    int size = stoi(parts[4]);
                    string vAlignStr = parts[5];
                    string text = cmd.substr(cmd.find(parts[5])+parts[5].length()+1);
                    size_t endPos = text.find_last_not_of("& ");
                    if (endPos != string::npos)
                        text = text.substr(0, endPos+1);
                    VALIGN vAlign;
                    if (vAlignStr == "bottom") vAlign = BOTTOM;
                    if (vAlignStr == "top") vAlign = TOP;
                    if (vAlignStr == "center") vAlign = CENTER_ASC;
                    if (vAlignStr == "baseline") vAlign = BASELINE;
                    printf("  write text '%s' (vAlign=%s) to disp %i\n", text.c_str(), vAlignStr.c_str(), disp);
                    manager.displays[disp]->drawText(text.c_str(), x, y, size, vAlign);
                    if (parts.back() != "&") manager.updateDisplay(disp);
                } else if (parts[0] == "rand") {
                    for (int i=0; i<manager.numDisplays; i++) {
                        if (!manager.displays[i]) continue;
                        manager.displays[i]->clear(rand());
                    }
                    clock_t start = clock();
                    manager.updateAll();
                    printf("  rand all took %.3f sec\n", (double)(clock()-start)/(CLOCKS_PER_SEC)*10);
                }
                else {
                    resp = "400 unknown command '"+parts[0]+"'";
                }
            } catch (...) {
                printf("error\n");
                auto expPtr = std::current_exception();

                try
                {
                    if(expPtr) std::rethrow_exception(expPtr);
                }
                catch(const std::exception& e) //it would not work if you pass by value
                {
                    std::cout << e.what();
                }
                resp = "500 internal server error\n";
            }

            fflush(stdout);

            if (seq != "0")
                fprintf(w, "#%s", seq.c_str());
            fprintf(w, "%s\n", resp.c_str());
            if (fflush(w))
                break;
        }

        fclose(r);
        fclose(w);
        shutdown(new_socket, SHUT_RDWR);
        close(new_socket);
        printf("connection terminated\n");
        clearAll(BLUE);
    }
    close(server_fd);
}