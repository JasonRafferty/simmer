FROM node:24-alpine
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
ENV PORT=80 DATA_DIR=/data
EXPOSE 80
CMD ["node","server.js"]
