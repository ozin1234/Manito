FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
RUN mkdir -p /app/data/reports && chown -R node:node /app/data
USER node
EXPOSE 8788
CMD ["node", "src/server.mjs"]
