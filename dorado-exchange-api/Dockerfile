# Use a lightweight Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy only package.json and lock file first
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy the entire project
COPY . .

# Expose port
EXPOSE 5000

# Run the app
CMD ["node", "server.js"]