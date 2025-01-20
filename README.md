# Image Metadata Processor

This application processes PNG images, extracting prompts from metadata and adding standardized keywords based on the content.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your input and output directories:

```
INPUT_DIR=/path/to/input
OUTPUT_DIR=/path/to/output
PORT=3000
```

3. Set up keywords:

```bash
cp src/keywords.example.js src/keywords.js
```

Edit `src/keywords.js` to customize your keyword mappings.

## Directory Structure

- `input/` - Place PNG files here for processing
- `output/` - Processed files will appear here
- `src/` - Source code
  - `services/` - Core services
  - `keywords.js` - Your keyword mappings (not tracked in git)

## Running the Application

```bash
npm start
```

The application will watch the input directory and automatically process any new PNG files that are added.

## Development

```bash
npm run dev
```

This will start the application with nodemon for automatic reloading during development.
