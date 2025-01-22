require("dotenv").config();
const express = require("express");
const { logInfo, logError } = require("./src/services/logger");
const exifToolService = require("./src/services/exifToolService");
const WatchMode = require("./src/services/processingModes/WatchMode");
const BatchMode = require("./src/services/processingModes/BatchMode");
const { processFile } = require("./src/fileProcessor");
const configService = require("./src/services/configService");
const path = require("path");

const app = express();
app.use(express.json()); // Add JSON body parsing

// Serve static files
app.use(express.static(path.join(__dirname, "src/public")));

let server = null;
let processingMode = null;

// Validate required environment variables
const inputDir = process.env.INPUT_DIR;
const outputDir = process.env.OUTPUT_DIR;

if (!inputDir || !outputDir) {
  console.error("ERROR: INPUT_DIR and OUTPUT_DIR must be set in .env file");
  process.exit(1);
}

// Graceful shutdown handler
async function shutdown(signal) {
  logInfo("Shutdown", `${signal} received. Starting graceful shutdown...`);

  if (processingMode) {
    await processingMode.stop();
  }

  if (server) {
    await new Promise((resolve) => {
      server.close(() => {
        logInfo("Shutdown", "Express server closed");
        resolve();
      });
    });
  }

  await exifToolService.cleanup();

  logInfo("Shutdown", "Graceful shutdown completed");
  process.exit(0);
}

// Mode switching function
async function switchMode(mode, options = {}) {
  if (processingMode) {
    await processingMode.stop();
  }

  const fileProcessor = {
    processFile: (filePath) => processFile(filePath, outputDir),
  };

  switch (mode) {
    case "watch":
      processingMode = new WatchMode(fileProcessor, inputDir);
      break;
    case "batch":
      if (!options.directory) {
        throw new Error("Directory is required for batch mode");
      }
      processingMode = new BatchMode(fileProcessor, options.directory);
      break;
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }

  await processingMode.start();
  return processingMode.status();
}

// Initialize
async function initialize() {
  try {
    // Load configuration first
    await configService.load();

    // Start in watch mode by default
    await switchMode("watch");

    // Setup cleanup handlers
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGUSR2", () => shutdown("SIGUSR2")); // For nodemon restart

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
  } catch (error) {
    logError("Setup", error);
    process.exit(1);
  }
}

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "File processor running",
    ...processingMode.status(),
  });
});

app.post("/mode", async (req, res) => {
  try {
    const { mode, options } = req.body;
    const status = await switchMode(mode, options);
    res.json(status);
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
});

app.get("/config", (req, res) => {
  try {
    const config = configService.getAll();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/config/:path", async (req, res) => {
  try {
    const { path } = req.params;
    const { value } = req.body;
    const updatedConfig = await configService.update(path, value);
    res.json(updatedConfig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Start the application
initialize();
