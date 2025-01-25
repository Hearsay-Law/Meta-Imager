# Use Node.js LTS version as base image
FROM node:20-slim

# Install system dependencies, including ExifTool
RUN apt-get update && apt-get install -y \
    exiftool \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Expose port (matching your Express configuration)
EXPOSE 3000

# Command to run the application
CMD [ "npm", "start" ]