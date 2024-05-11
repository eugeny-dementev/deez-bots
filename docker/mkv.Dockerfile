# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/playwright:v1.44.0-jammy

RUN wget -O /usr/share/keyrings/gpg-pub-moritzbunkus.gpg https://mkvtoolnix.download/gpg-pub-moritzbunkus.gpg
RUN echo "deb [signed-by=/usr/share/keyrings/gpg-pub-moritzbunkus.gpg] https://mkvtoolnix.download/ubuntu/ jammy main" | tee /etc/apt/sources.list.d/mkvtoolnix.list
RUN apt update
RUN apt install -y mkvtoolnix

# docker build -f ./docker/mkv.Dockerfile --tag utils/automatization .
