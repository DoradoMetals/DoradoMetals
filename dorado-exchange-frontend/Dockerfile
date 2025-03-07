FROM node:18-alpine

WORKDIR /usr/src/app

COPY package.json ./  
RUN pnpm install

COPY . .

RUN pnpm run build

CMD ["npm", "run", "start"]