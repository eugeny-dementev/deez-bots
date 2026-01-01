# syntax=docker/dockerfile:1

FROM node:24-alpine

ARG YT_DLP_VERSION=latest

RUN apk add --no-cache python3 ffmpeg ca-certificates curl
RUN curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/${YT_DLP_VERSION}/download/yt-dlp" -o /usr/bin/yt-dlp \
  && chmod 755 /usr/bin/yt-dlp

# docker build -f ./docker/dl.Dockerfile --tag utils/dl .
