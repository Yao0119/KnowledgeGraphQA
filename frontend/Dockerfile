FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund \
    && npm install --no-audit --no-fund --no-save @rollup/rollup-linux-x64-gnu@4.52.5

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY docker-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
