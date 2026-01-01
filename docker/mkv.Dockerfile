# syntax=docker/dockerfile:1

FROM node:24-alpine

RUN apk add --no-cache mkvtoolnix

# docker build -f ./docker/mkv.Dockerfile --tag utils/automatization .
