FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=8080 DATA_DIR=/data NODE_ENV=production
VOLUME /data
EXPOSE 8080
CMD ["node", "server/index.mjs"]
