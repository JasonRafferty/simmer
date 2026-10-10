FROM node:24-alpine
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
ENV PORT=80 DATA_DIR=/data
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1/api/health || exit 1
CMD ["node","server.js"]
