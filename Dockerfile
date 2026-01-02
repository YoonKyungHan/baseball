FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm i

COPY . .

ENV NODE_ENV=production

EXPOSE 3001

CMD ["npm", "start"]

