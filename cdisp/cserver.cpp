#include <stdio.h>
#include <sys/socket.h> 
#include <netinet/in.h> 
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include "lib/common.h"
#include "lib/Manager.h"
#include "lib/Disp128.h"
#include "lib/Image.h"
#include "HW/DEV_Config.h"
#include <string>
#include <vector>
#include <map>
#include <signal.h>

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

Manager manager(8);

void clearAll(Color color) {
    for (int i=0; i<manager.numDisplays; i++) {
        if (manager.displays[i]) {
            manager.displays[i]->clear(color);
        }
    }
    manager.updateAll();
}

int main() {
    printf("Starting C server\n"); 
    int server_fd, new_socket, valread; 
    struct sockaddr_in address; 
    int opt = 1; 
    int addrlen = sizeof(address); 

     // Creating socket file descriptor 
    if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) == 0) 
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

    printf("initializing displays..");
	if(DEV_ModuleInit() != 0){
        DEV_ModuleExit();
        return 1;
    } 

    manager.displays[4] = new Disp128(1);
    manager.displays[5] = new Disp128(1);
    manager.displays[6] = new Disp128(1);
    manager.displays[7] = new Disp128(1);
    manager.initAll();

    printf("server ready\n");

    while (true) {
        if ((new_socket = accept(server_fd, (struct sockaddr *)&address, (socklen_t*)&addrlen)) < 0) 
        { 
            perror("accept fail"); 
            exit(1); 
        } 
        printf("Incoming connection...\n");
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
                    printf("end session\n");
                    break;
                } else if (parts[0] == "clear") {
                    int disp = stoi(parts[1]);
                    Color color = toColor(parts[2].c_str());
                    printf("clear disp %i to 0x%x\n", disp, color);
                    manager.displays[disp]->clear(color);
                    manager.updateDisplay(disp);
                } else if (parts[0] == "file") {
                    int disp = stoi(parts[1]);
                    string path = cmd.substr(cmd.find(parts[1])+parts[1].length()+1);
                    printf("blit image '%s' to disp %i\n", path.c_str(), disp);
                    manager.displays[disp]->drawImage(getImage(path));
                    manager.updateDisplay(disp);
                } else if (parts[0] == "image") {
                    int disp = stoi(parts[1]);
                    string name = cmd.substr(cmd.find(parts[1])+parts[1].length()+1);
                    char path[1000];
                    sprintf(path, "media/%i/%s.png", manager.displays[disp]->height, name.c_str());
                    printf("blit image '%s' to disp %i\n", path, disp);
                    manager.displays[disp]->drawImage(getImage(string(path)));
                    manager.updateDisplay(disp);
                } else {
                    resp = "400 unknown command '"+parts[0]+"'";
                }
            } catch (...) {
                printf("error\n");
                resp = "500 internal server error\n";
            }

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