# syntax=docker/dockerfile:1

FROM node:lts-alpine

RUN apk update
RUN apk add ffmpeg
RUN apk add mkvtoolnix

# docker build -f ./docker/mkv.Dockerfile --tag utils/mkv .
