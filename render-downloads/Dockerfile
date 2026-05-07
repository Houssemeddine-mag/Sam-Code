FROM node:20-alpine

WORKDIR /app
COPY render-downloads/package.json ./package.json
RUN npm install --omit=dev

COPY render-downloads/server.js ./server.js
COPY landing/ ./landing/
RUN mkdir -p /data/downloads

ENV DOWNLOAD_DIR=/data/downloads
EXPOSE 10000

CMD ["node", "server.js"]
