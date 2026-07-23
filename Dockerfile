FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY config ./config

ENV NODE_ENV=production
CMD ["npm", "start"]
