FROM node:20.11.0-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20.11.0-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=0 /app/dist ./dist

USER node

ENV NODE_ENV=production

CMD ["node", "dist/agent.js"]