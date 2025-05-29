//index.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs").promises;
// readline is no longer directly used here for prompting, but ConsoleManager might use it internally.

const { logInfo, logError } = require("./src/services/logger");
const exifToolService = require("./src/services/exifToolService");
const WatchMode = require("./src/services/processingModes/WatchMode");
const BatchMode = require("./src/services/processingModes/BatchMode");
const { processFile } = require("./src/fileProcessor");
const configService = require("./src/services/configService");
const ConsoleManager = require("./src/services/ConsoleManager"); // Import the new class

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "src/public")));

let server = null;
let processingMode = null;
let consoleManager = null; // Instance of ConsoleManager

const inputDir = process.env.INPUT_DIR;
const baseOutputDir = process.env.OUTPUT_DIR;

if (!inputDir || !baseOutputDir) {
  console.error("ERROR: INPUT_DIR and OUTPUT_DIR must be set in .env file");
  process.exit(1);
}

function getCurrentTargetDir() {
  const subfolder = configService.get("runtime.currentTargetSubfolder");
  return subfolder && subfolder.trim() !== ""
    ? path.join(baseOutputDir, subfolder)
    : baseOutputDir;
}

function displayCurrentTarget() {
  const currentTarget = getCurrentTargetDir();
  console.log(`\n➡️ Current target directory: ${currentTarget}`);
  logInfo("TargetDir", `Current target directory set to: ${currentTarget}`);
  if (consoleManager) {
    // If console manager is active, re-display its menu after target change
    // Or let it handle its own display refresh if it needs to.
    // For now, we'll assume it might need a cue if displayMenu is only on start.
    // If ConsoleManager's displayMenu is called internally upon action, this isn't needed.
    // consoleManager.displayMenu();
  }
}

// Graceful shutdown handler
async function shutdown(signal) {
  logInfo("Shutdown", `${signal} received. Starting graceful shutdown...`);

  if (consoleManager) {
    consoleManager.stop(); // Stop console manager, restores terminal
    consoleManager = null;
  }

  if (processingMode) {
    await processingMode.stop();
  }

  if (server) {
    await new Promise((resolve) => {
      server.close(() => {
        logInfo("Shutdown", "Express server closed");
        resolve();
      });
    }).catch((e) => logError("Shutdown", e, { context: "server.close" }));
  }

  await exifToolService
    .cleanup()
    .catch((e) =>
      logError("Shutdown", e, { context: "exifToolService.cleanup" })
    );

  logInfo("Shutdown", "Graceful shutdown completed");
  // process.stdin.setRawMode(false) is now handled by ConsoleManager.stop()
  // and also as a final fallback in the SIGINT handler.
  process.exit(0);
}

// Mode switching function
async function switchMode(mode, options = {}) {
  if (processingMode) {
    await processingMode.stop();
  }

  const effectiveOutputDir = getCurrentTargetDir();
  try {
    await fs.mkdir(effectiveOutputDir, { recursive: true });
    logInfo(
      "SwitchMode",
      `Ensured effective output directory exists: ${effectiveOutputDir}`
    );
  } catch (err) {
    logError(
      "SwitchMode",
      `Failed to create effective output directory ${effectiveOutputDir}: ${err.message}`
    );
  }

  const fileProcessor = {
    processFile: (filePath) => processFile(filePath, effectiveOutputDir),
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

  if (processingMode && typeof processingMode.setOptions === "function") {
    processingMode.setOptions(options);
  }

  await processingMode.start();
  return processingMode.status();
}

// Initialize
async function initialize() {
  try {
    await configService.load();
    await switchMode("watch"); // Start in default mode
    displayCurrentTarget(); // Show initial target

    // Initialize and start ConsoleManager
    consoleManager = new ConsoleManager();

    // Listen for events from ConsoleManager
    consoleManager.on("set-target-subfolder", async (subfolderName) => {
      logInfo(
        "ConsoleEvent",
        `Received set-target-subfolder event with: ${subfolderName}`
      );
      if (subfolderName && subfolderName.trim() !== "") {
        const fullSubfolderPath = path.join(baseOutputDir, subfolderName);
        try {
          await fs.mkdir(fullSubfolderPath, { recursive: true });
          logInfo(
            "TargetDir",
            `Ensured subfolder exists via console: ${fullSubfolderPath}`
          );
        } catch (err) {
          logError(
            "TargetDir",
            `Error creating subfolder ${fullSubfolderPath}: ${err.message}`
          );
          console.error(
            `Error creating subfolder: ${err.message}. Please check permissions.`
          );
          // Optionally, don't update config if dir creation fails
        }
      }
      await configService.update(
        "runtime.currentTargetSubfolder",
        subfolderName
      );
      displayCurrentTarget(); // Update display

      if (processingMode) {
        const currentModeType =
          processingMode instanceof WatchMode ? "watch" : "batch";
        const currentOptions = processingMode.getOptions
          ? processingMode.getOptions()
          : {};
        logInfo(
          "TargetDir",
          `Restarting ${currentModeType} mode with new target directory.`
        );
        await switchMode(currentModeType, currentOptions);
      }
      // After action, ConsoleManager should ideally re-display its own menu,
      // or we call it here if needed. The `promptForSubfolder` in ConsoleManager
      // intentionally doesn't call displayMenu in its finally block, assuming the
      // event handler here (or a subsequent user action) will refresh the overall view.
      // Let's have ConsoleManager handle its own menu display after its actions.
      // (The ConsoleManager's keypress listener will call displayMenu after prompt)
      // So, no consoleManager.displayMenu() here, let the keypress listener in ConsoleManager manage it.
    });

    consoleManager.on("shutdown-request", async (signalOrigin) => {
      logInfo(
        "ConsoleEvent",
        `Received shutdown-request event from ConsoleManager, origin: ${signalOrigin}`
      );
      await shutdown(signalOrigin || "CONSOLE_REQUEST");
    });

    consoleManager.start(); // Start listening for console commands

    // Setup global signal handlers
    process.on("SIGINT", async () => {
      logInfo("SignalHandler", "SIGINT received by process.on('SIGINT')");
      await shutdown("SIGINT_APP");
    });
    process.on("SIGTERM", async () => await shutdown("SIGTERM_APP"));
    process.on("SIGUSR2", async () => {
      // For nodemon restart
      logInfo("SignalHandler", "SIGUSR2 (nodemon) received.");
      // For nodemon, we want a clean shutdown but not process.exit(0)
      // as nodemon handles the restart.
      if (consoleManager) consoleManager.stop();
      if (processingMode) await processingMode.stop();
      if (server) await new Promise((resolve) => server.close(resolve));
      await exifToolService.cleanup();
      logInfo(
        "SignalHandler",
        "Nodemon cleanup complete. Letting nodemon restart."
      );
      // Don't call process.exit() for SIGUSR2 if nodemon is managing it
    });

    const PORT = process.env.PORT || 3000;
    server = app.listen(PORT, () => {
      logInfo("Setup", `Server is running on port ${PORT}`);
    });
    server.on("error", (error) => {
      logError("Setup", error, { port: PORT });
      if (error.code === "EADDRINUSE") {
        // Ensure console is usable if server fails to start
        if (consoleManager) consoleManager.stop();
        process.exit(1);
      }
    });

    logInfo("Setup", "Application initialized successfully");
  } catch (error) {
    logError("Setup", error, { context: "Initialization failed" });
    if (consoleManager)
      try {
        consoleManager.stop();
      } catch (e) {
        /*ignore*/
      }
    else if (process.stdin.isTTY)
      try {
        process.stdin.setRawMode(false);
      } catch (e) {
        /*ignore*/
      }
    process.exit(1);
  }
}

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "File processor running",
    ...(processingMode
      ? processingMode.status()
      : { mode: "N/A", status: "Not initialized" }),
  });
});

app.post("/mode", async (req, res) => {
  try {
    const { mode, options } = req.body;
    const status = await switchMode(mode, options);
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
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
    const { path: configPathFromReq } = req.params;
    const { value } = req.body;
    const updatedConfig = await configService.update(configPathFromReq, value);
    res.json(updatedConfig);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Mode switching function (ensure this is complete from your previous working version)
// (Included from previous response for completeness)
async function switchMode(mode, options = {}) {
  if (processingMode) {
    await processingMode.stop();
  }

  const effectiveOutputDir = getCurrentTargetDir();
  try {
    await fs.mkdir(effectiveOutputDir, { recursive: true });
    logInfo(
      "SwitchMode",
      `Ensured effective output directory exists: ${effectiveOutputDir}`
    );
  } catch (err) {
    logError(
      "SwitchMode",
      `Failed to create effective output directory ${effectiveOutputDir}: ${err.message}`
    );
  }

  const fileProcessor = {
    processFile: (filePath) => processFile(filePath, effectiveOutputDir),
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

  if (processingMode && typeof processingMode.setOptions === "function") {
    processingMode.setOptions(options); // If your modes use this
  }

  await processingMode.start();
  return processingMode.status();
}

initialize();
