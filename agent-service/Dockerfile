FROM node:20.11.0-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20.11.0-slim

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=0 /app/dist .

RUN mkdir -p /workspace

WORKDIR /workspace

USER node

ENV NODE_ENV=production
ENV WEBSOCKET_PORT=8888

EXPOSE 8888

CMD ["node", "../app/agent.js"]
