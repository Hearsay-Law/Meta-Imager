//index.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs").promises;

const { logInfo, logError } = require("./src/services/logger");
const exifToolService = require("./src/services/exifToolService");
const WatchMode = require("./src/services/processingModes/WatchMode");
const BatchMode = require("./src/services/processingModes/BatchMode");
const { processFile } = require("./src/fileProcessor");
const configService = require("./src/services/configService");
const ConsoleManager = require("./src/services/ConsoleManager");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "src/public")));

let server = null;
let processingMode = null;
let consoleManager = null;

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
  console.log(`\n➡️  Current target directory: ${currentTarget}`);
  logInfo("TargetDir", `Current target directory set to: ${currentTarget}`);
}

// Graceful shutdown handler
async function shutdown(signal) {
  logInfo("Shutdown", `${signal} received. Starting graceful shutdown...`);

  if (consoleManager) {
    consoleManager.stop();
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
  // Ensure terminal is sane even if consoleManager.stop() had issues or wasn't called
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch (e) {
      /* ignore */
    }
  }
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
    // Potentially throw error or prevent mode switch if directory creation is critical
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
        logError("SwitchMode", "Directory is required for batch mode.");
        throw new Error("Directory is required for batch mode");
      }
      processingMode = new BatchMode(fileProcessor, options.directory);
      break;
    default:
      logError("SwitchMode", `Unknown mode attempt: ${mode}`);
      throw new Error(`Unknown mode: ${mode}`);
  }

  if (processingMode && typeof processingMode.setOptions === "function") {
    processingMode.setOptions(options);
  }

  await processingMode.start();
  logInfo(
    "SwitchMode",
    `Switched to ${mode} mode. Status:`,
    processingMode.status()
  );
  return processingMode.status();
}

// Initialize
async function initialize() {
  try {
    await configService.load();

    // Initial mode switch and target display are important before console manager starts
    // so that the first '?' press has info to show.
    await switchMode("watch"); // Start in default mode
    displayCurrentTarget(); // Show initial target

    consoleManager = new ConsoleManager();

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
          // Decide if config update should be skipped if dir creation fails
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
        // Preserve existing options if possible, or reset if needed.
        const currentOptions = processingMode.getOptions
          ? processingMode.getOptions()
          : {};
        logInfo(
          "TargetDir",
          `Restarting ${currentModeType} mode with new target directory.`
        );
        await switchMode(currentModeType, currentOptions);
      }
      // ConsoleManager's keypress listener will re-display its menu
    });

    consoleManager.on("request-status-display", () => {
      logInfo("ConsoleEvent", "Received request-status-display event.");
      console.log(); // Add a newline for better formatting before status

      displayCurrentTarget(); // Shows the current target directory

      if (processingMode && typeof processingMode.status === "function") {
        const status = processingMode.status();
        console.log(`⚙️  Mode: ${status.mode}`);
        if (status.details) {
          // General details if provided
          console.log(`   Status: ${status.details}`);
        }
        if (status.mode === "watch" && typeof status.watching !== "undefined") {
          console.log(`   Watching: ${status.watching}`);
        } else if (status.mode === "batch") {
          if (typeof status.directory !== "undefined") {
            console.log(`   Directory: ${status.directory}`);
          }
          if (
            typeof status.processed !== "undefined" &&
            typeof status.total !== "undefined"
          ) {
            console.log(
              `   Progress: ${status.processed}/${status.total} files`
            );
          }
        }
      } else {
        console.log(
          "⚙️  Mode: N/A (Processing mode not active or status unavailable)"
        );
      }
      // ConsoleManager's _keypressListener should have already called its displayMenu()
    });

    consoleManager.on("shutdown-request", async (signalOrigin) => {
      logInfo(
        "ConsoleEvent",
        `Received shutdown-request event from ConsoleManager, origin: ${signalOrigin}`
      );
      await shutdown(signalOrigin || "CONSOLE_REQUEST");
    });

    consoleManager.start(); // Start listening for console commands AFTER setting up all listeners

    // Setup global signal handlers
    process.on("SIGINT", async () => {
      logInfo("SignalHandler", "SIGINT received by process.on('SIGINT')");
      await shutdown("SIGINT_APP");
    });
    process.on("SIGTERM", async () => await shutdown("SIGTERM_APP"));
    process.on("SIGUSR2", async () => {
      // For nodemon restart
      logInfo("SignalHandler", "SIGUSR2 (nodemon) received.");
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
        if (consoleManager) consoleManager.stop();
        process.exit(1);
      }
    });

    logInfo("Setup", "Application initialized successfully");
  } catch (error) {
    logError("Setup", error, { context: "Initialization failed" });
    if (consoleManager) {
      try {
        consoleManager.stop();
      } catch (e) {
        logError("Setup", e, {
          context: "ConsoleManager stop failed during init error",
        });
      }
    } else if (process.stdin.isTTY) {
      // Fallback if consoleManager didn't initialize or stop correctly
      try {
        process.stdin.setRawMode(false);
      } catch (e) {
        /* ignore */
      }
    }
    process.exit(1);
  }
}

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "File processor running",
    ...(processingMode && typeof processingMode.status === "function"
      ? processingMode.status()
      : { mode: "N/A", status: "Not initialized" }),
  });
});

app.post("/mode", async (req, res) => {
  try {
    const { mode, options } = req.body;
    if (!mode) {
      return res.status(400).json({ error: "Mode is required" });
    }
    const status = await switchMode(mode, options || {});
    res.json(status);
  } catch (error) {
    logError("API /mode", error.message, { body: req.body });
    res.status(400).json({ error: error.message });
  }
});

app.get("/config", (req, res) => {
  try {
    const config = configService.getAll();
    res.json(config);
  } catch (error) {
    logError("API /config GET", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.put("/config/:path", async (req, res) => {
  try {
    const { path: configPathFromReq } = req.params;
    const { value } = req.body;
    if (typeof value === "undefined") {
      return res
        .status(400)
        .json({ error: "Value is required in request body" });
    }
    const updatedConfig = await configService.update(configPathFromReq, value);
    res.json(updatedConfig);
  } catch (error) {
    logError("API /config PUT", error.message, {
      path: req.params.path,
      value: req.body.value,
    });
    res.status(400).json({ error: error.message });
  }
});

// Kick off the application
initialize();
