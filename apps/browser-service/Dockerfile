FROM apify/actor-node-playwright-camoufox:24
WORKDIR /app
COPY apps/browser-service/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts
COPY apps/browser-service/src ./src
EXPOSE 9222 9223
CMD ["npm", "start"]
