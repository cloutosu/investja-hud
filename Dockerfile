FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production STORE_DIR=/data PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY server ./server
COPY netlify ./netlify
VOLUME /data
EXPOSE 8080
CMD ["node", "server/standalone.mjs"]
