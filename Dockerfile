FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

ENV PORT=4173
EXPOSE 4173

CMD ["npm", "start"]
