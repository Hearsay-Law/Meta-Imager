require("dotenv").config();
const express = require("express");
const fs = require("fs").promises;
const fsWatch = require("fs").watch; // Regular fs for watching
const path = require("path");
const { processFile } = require("./fileProcessor");
const app = express();

// Define directories with environment variables
const inputDir = process.env.INPUT_DIR;
const reviewedDir = path.join(__dirname, "reviewed");
const outputDir = process.env.OUTPUT_DIR;

// Validate required environment variables
if (!inputDir || !outputDir) {
  console.error("ERROR: INPUT_DIR and OUTPUT_DIR must be set in .env file");
  process.exit(1);
}

// Ensure directories exist
async function ensureDirectories() {
  for (const dir of [inputDir, reviewedDir, outputDir]) {
    try {
      await fs.access(dir);
      console.log(`Confirmed access to directory: ${dir}`);
    } catch {
      try {
        await fs.mkdir(dir);
        console.log(`Created directory: ${dir}`);
      } catch (error) {
        console.error(`Error accessing/creating directory ${dir}:`, error);
        throw error;
      }
    }
  }
}

// Watch for new files
function watchDirectory() {
  try {
    const watcher = fsWatch(inputDir, async (eventType, filename) => {
      if (eventType === "rename" && filename) {
        // 'rename' event happens on creation
        const filePath = path.join(inputDir, filename);

        try {
          // Check if file exists (to distinguish between creation and deletion)
          await fs.access(filePath);

          // Wait a short time to ensure file is completely written
          await new Promise((resolve) => setTimeout(resolve, 1000));

          console.log(`New file detected: ${filename}`);
          await processFile(filePath, reviewedDir, outputDir);
        } catch (error) {
          if (error.code === "ENOENT") {
            // File was deleted, ignore
            return;
          }
          console.error(`Error processing new file ${filename}:`, error);
        }
      }
    });

    console.log(`Watching for new files in: ${inputDir}`);

    watcher.on("error", (error) => {
      console.error("Watch error:", error);
    });
  } catch (error) {
    console.error("Error setting up directory watch:", error);
  }
}

// Initialize
async function initialize() {
  await ensureDirectories();
  watchDirectory();
  console.log("File watcher initialized");
}

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "File processor running",
    inputDir,
    reviewedDir,
    outputDir,
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  await initialize();
});
