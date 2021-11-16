#!/bin/sh
set -x
set -e

apt-get update
apt-get install -y libfreetype6-dev libjpeg-dev libavformat-dev libswscale-dev libavcodec-dev
apt-get install -y libegl1-mesa-dev libdrm-dev libgbm-dev libfreetype6-dev libjpeg-dev libavformat-dev libswscale-dev libavcodec-dev
apt-get install -y libasound2-dev
apt install -y screen tmux

dpkg -i wiringpi-latest.deb

tar -xvzf zulu11.33.21-ca-jdk11.0.4-linux_aarch32hf.tar.gz
update-alternatives --install /usr/bin/java java /home/pi/zulu11.33.21-ca-jdk11.0.4-linux_aarch32hf/bin/java 1
update-alternatives --install /usr/bin/javac javac /home/pi/zulu11.33.21-ca-jdk11.0.4-linux_aarch32hf/bin/javac 1

cd aminogfx-gl
npm install
chmod +x rebuild.sh
./rebuild.sh
cd ../zpin
npm install
chmod +x *start*
