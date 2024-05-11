# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/playwright:jammy-amd64

RUN wget -O /usr/share/keyrings/gpg-pub-moritzbunkus.gpg https://mkvtoolnix.download/gpg-pub-moritzbunkus.gpg
RUN echo "deb [signed-by=/usr/share/keyrings/gpg-pub-moritzbunkus.gpg] https://mkvtoolnix.download/ubuntu/ jammy main" | tee /etc/apt/sources.list.d/mkvtoolnix.list
RUN apt update
RUN apt install -y mkvtoolnix

# docker build -f mkv.Dockerfile --tag utils/automatization
