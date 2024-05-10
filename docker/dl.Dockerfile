# syntax=docker/dockerfile:1

FROM bitnami/node

ADD --chmod=755 https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp /usr/bin

RUN apt update
RUN apt install dirmngr software-properties-common apt-transport-https curl lsb-release ca-certificates -y
RUN gpg --list-keys
RUN gpg --no-default-keyring --keyring /usr/share/keyrings/deb-multimedia.gpg --keyserver keyserver.ubuntu.com --recv-keys 5C808C2B65558117
RUN echo "deb [signed-by=/usr/share/keyrings/deb-multimedia.gpg] https://www.deb-multimedia.org $(lsb_release -sc) main non-free" | tee /etc/apt/sources.list.d/deb-multimedia.list
RUN apt update
RUN apt install -y ffmpeg

# docker build -f dl.Dockerfile --tag utils/dl .
