FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy application files
COPY package.json ./
COPY server.js ./
COPY public/ ./public/

# Start the server
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080

CMD [ "node", "server.js" ]
