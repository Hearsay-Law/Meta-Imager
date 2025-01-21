# Image Metadata Processor

An automated Node.js application that processes PNG images, adding metadata, watermarks, and keyword-based categorization based on embedded prompt data. Designed for processing AI-generated images with attached prompt information.

## Features

- Automated file watching and processing
- Date-based directory organization
- Metadata extraction and enrichment
- Intelligent keyword matching and categorization
- Automatic watermarking
- Color profile management (sRGB)
- Comprehensive logging system
- Web status endpoint

## Prerequisites

- Node.js (v14 or higher recommended)
- ExifTool installed on your system ([Download ExifTool](https://exiftool.org/))

## Installation

1. Clone the repository:

```bash
git clone [repository-url]
cd image-metadata-processor
```

2. Install dependencies:

```bash
npm install
```

3. Create your configuration:

```bash
cp .env.example .env
```

4. Set up your keywords:

```bash
cp src/keywords.example.js src/keywords.js
```

## Configuration

### Environment Variables

Edit `.env` file with your settings:

```env
# Required directory paths
INPUT_DIR="C:\\Path\\To\\Input\\Directory"
OUTPUT_DIR="\\\\SERVER\\Share\\Path\\To\\Output\\Directory"

# Optional settings
PORT=3000        # Web server port (default: 3000)
LOG_LEVEL=info   # Logging level (default: info)
```

### Keyword Configuration

Edit `src/keywords.js` to customize your keyword mappings:

```javascript
const keywordsMap = {
  detected_term: "Category: Descriptive Label",
  // Add your keyword mappings...
};
```

## Usage

Start the application:

```bash
npm start
```

The application will:

1. Create necessary directories if they don't exist
2. Watch for new PNG files in the input directory
3. Process files automatically when detected
4. Save processed files to the output directory

### Directory Structure

The application creates date-based directories in your input path:

```
INPUT_DIR/
└── MM-DD/         # Today's date
    └── image.png  # Place files here
```

### File Processing

1. Place PNG files in today's input directory
2. Files are automatically detected and processed
3. Processed files appear in the output directory with:
   - Added metadata
   - Watermark
   - Keyword categorization
   - Color profile correction

### Monitoring

Access the status endpoint:

```
http://localhost:3000/
```

Monitor logs in:

- Console output (color-coded)
- `error.log` (error-level logs)
- `combined.log` (all logs)

## Development

### Project Structure

```
project/
├── src/
│   ├── services/
│   │   ├── exifToolService.js
│   │   ├── keywordMatcher.js
│   │   ├── tempFileService.js
│   │   ├── logger.js
│   │   └── colorLogger.js
│   ├── fileProcessor.js
│   └── keywords.js
├── temp/          # Temporary processing directory
├── .env           # Environment configuration
└── index.js       # Application entry point
```

### Error Handling

- Failed operations are logged to `error.log`
- Temporary files are automatically cleaned up
- Process maintains stability through error recovery

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Acknowledgments

- ExifTool for metadata management
- Sharp for image processing
- Winston for logging
