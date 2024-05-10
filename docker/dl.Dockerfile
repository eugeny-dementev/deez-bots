# syntax=docker/dockerfile:1

FROM node:lts-alpine

ADD --chmod=755 https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp /usr/bin

RUN apk update
RUN apk add python3
RUN apk add ffmpeg

# docker build -f ./docker/dl.Dockerfile --tag utils/dl .
