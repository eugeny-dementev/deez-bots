# This file is generated by Nx.
#
# Build the docker image with `nx docker-build yt-dlp`.
# Tip: Modify "docker-build" options in project.json to change docker build args.
#
# Run the container with
# docker run -d --restart=always `
# -v path/to/tmp:/tmp `
# -v path/to/videos:/videos `
# -v path/to/cookies.txt:/cookies.txt `
# --env-file=./bots/yt-dlp/.production.env `
# --name=yt-dlp-bot yt-dlp-bot-image
FROM utils/dl

WORKDIR /app

RUN addgroup --system yt-dlp && \
    adduser --system -G yt-dlp yt-dlp

COPY dist/bots/yt-dlp yt-dlp
RUN chown -R yt-dlp:yt-dlp .

# You can remove this install step if you build with `--bundle` option.
# The bundled output will include external dependencies.
RUN npm --prefix yt-dlp --omit=dev -f install

CMD [ "node", "yt-dlp" ]
