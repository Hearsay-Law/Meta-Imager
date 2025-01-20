require("dotenv").config();
const express = require("express");
const fs = require("fs").promises;
const fsWatch = require("fs").watch;
const path = require("path");
const { processFile } = require("./src/fileProcessor");
const exifToolService = require("./src/services/exifToolService");
const { logInfo, logError } = require("./src/services/logger");

const app = express();
let server = null;

// Define directories with environment variables
const inputDir = process.env.INPUT_DIR;
const outputDir = process.env.OUTPUT_DIR;

// Validate required environment variables
if (!inputDir || !outputDir) {
  console.error("ERROR: INPUT_DIR and OUTPUT_DIR must be set in .env file");
  process.exit(1);
}

// Get today's date-specific directory name
function getTodaysDirName() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

// Get full path for today's input directory
function getTodaysInputPath() {
  return path.join(inputDir, getTodaysDirName());
}

// Ensure directories exist
async function ensureDirectories() {
  const todaysInputPath = getTodaysInputPath();

  for (const dir of [inputDir, outputDir, todaysInputPath]) {
    try {
      await fs.access(dir);
      logInfo("Setup", `Confirmed access to directory: ${dir}`);
    } catch {
      try {
        await fs.mkdir(dir, { recursive: true });
        logInfo("Setup", `Created directory: ${dir}`);
      } catch (error) {
        logError("Setup", error, { dir });
        throw error;
      }
    }
  }
}

// Watch for new files
function watchDirectory() {
  const todaysInputPath = getTodaysInputPath();

  try {
    const watcher = fsWatch(todaysInputPath, async (eventType, filename) => {
      if (eventType === "rename" && filename) {
        const filePath = path.join(todaysInputPath, filename);

        try {
          await fs.access(filePath);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          logInfo("FileWatcher", `New file detected: ${filename}`);
          await processFile(filePath, outputDir);
        } catch (error) {
          if (error.code === "ENOENT") {
            return;
          }
          logError("FileWatcher", error, { filename });
        }
      }
    });

    logInfo("FileWatcher", `Watching for new files in: ${todaysInputPath}`);

    watcher.on("error", (error) => {
      logError("FileWatcher", error);
    });

    return watcher;
  } catch (error) {
    logError("FileWatcher", error);
    throw error;
  }
}

// Check if we need to switch to a new day's directory
async function checkForNewDay(currentWatcher) {
  const newDirName = getTodaysDirName();
  const currentWatchPath = currentWatcher._handle.path; // Get current watched path
  const expectedPath = getTodaysInputPath();

  if (currentWatchPath !== expectedPath) {
    logInfo("DayChange", `Switching to new day's directory: ${newDirName}`);

    // Close old watcher
    currentWatcher.close();

    // Ensure new directory exists and start new watcher
    await ensureDirectories();
    return watchDirectory();
  }

  return currentWatcher;
}

// Graceful shutdown handler
async function shutdown(signal) {
  logInfo("Shutdown", `${signal} received. Starting graceful shutdown...`);

  // Close Express server
  if (server) {
    await new Promise((resolve) => {
      server.close(() => {
        logInfo("Shutdown", "Express server closed");
        resolve();
      });
    });
  }

  // Close ExifTool
  await exifToolService.cleanup();

  logInfo("Shutdown", "Graceful shutdown completed");
  process.exit(0);
}

// Initialize
async function initialize() {
  try {
    await ensureDirectories();
    let watcher = watchDirectory();

    // Setup cleanup handlers
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGUSR2", () => shutdown("SIGUSR2")); // For nodemon restart

    // Check for day change every minute
    setInterval(async () => {
      watcher = await checkForNewDay(watcher);
    }, 60000);

    // Start server
    const PORT = process.env.PORT || 3000;
    server = app.listen(PORT, () => {
      logInfo("Setup", `Server is running on port ${PORT}`);
    });

    // Basic error handling for the server
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        logError("Setup", new Error(`Port ${PORT} is already in use`));
        process.exit(1);
      } else {
        logError("Setup", error);
      }
    });

    logInfo("Setup", "Application initialized successfully");
    return watcher;
  } catch (error) {
    logError("Setup", error);
    process.exit(1);
  }
}

// Routes
app.get("/", (req, res) => {
  const todaysInputPath = getTodaysInputPath();
  res.json({
    message: "File processor running",
    inputDir,
    todaysInputPath,
    outputDir,
  });
});

// Start the application
initialize();
