const fs = require("fs").promises;
const fsWatch = require("fs").watch;
const path = require("path");
const ProcessingMode = require("./ProcessingMode");
const { logInfo, logDebug } = require("../../services/logger");

class WatchMode extends ProcessingMode {
  constructor(fileProcessor, inputDir) {
    super(fileProcessor);
    this.inputDir = inputDir;
    this.watcher = null;
    this.currentWatchPath = null;
  }

  getTodaysDirName() {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${month}-${day}`;
  }

  getTodaysInputPath() {
    return path.join(this.inputDir, this.getTodaysDirName());
  }

  async ensureDirectories() {
    const todaysInputPath = this.getTodaysInputPath();

    for (const dir of [this.inputDir, todaysInputPath]) {
      try {
        await fs.access(dir);
        logInfo("Setup", `Confirmed access to directory: ${dir}`);
      } catch {
        try {
          await fs.mkdir(dir, { recursive: true });
          logInfo("Setup", `Created directory: ${dir}`);
        } catch (error) {
          this.handleError("Setup", error, { dir });
          throw error;
        }
      }
    }
  }

  async startWatching(dirPath) {
    try {
      const watcher = fsWatch(dirPath, async (eventType, filename) => {
        if (eventType === "rename" && filename) {
          const filePath = path.join(dirPath, filename);

          try {
            await fs.access(filePath);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            logInfo("FileWatcher", `New file detected: ${filename}`);
            await this.fileProcessor.processFile(filePath);
          } catch (error) {
            if (error.code === "ENOENT") {
              return;
            }
            this.handleError("FileWatcher", error, { filename });
          }
        }
      });

      watcher.on("error", (error) => {
        this.handleError("FileWatcher", error);
      });

      this.watcher = watcher;
      this.currentWatchPath = dirPath;
      logInfo("FileWatcher", `Watching for new files in: ${dirPath}`);
    } catch (error) {
      this.handleError("FileWatcher", error);
      throw error;
    }
  }

  async checkForNewDay() {
    const expectedPath = this.getTodaysInputPath();

    if (this.currentWatchPath !== expectedPath) {
      logInfo(
        "DayChange",
        `Switching to new day's directory: ${this.getTodaysDirName()}`
      );

      if (this.watcher) {
        this.watcher.close();
      }

      await this.ensureDirectories();
      await this.startWatching(expectedPath);
    }
  }

  async start() {
    try {
      await this.ensureDirectories();
      await this.startWatching(this.getTodaysInputPath());

      // Check for day change every minute
      this.dayCheckInterval = setInterval(() => this.checkForNewDay(), 60000);

      this.isActive = true;
      logInfo("WatchMode", "Watch mode started successfully");
    } catch (error) {
      this.handleError("Start", error);
      throw error;
    }
  }

  async stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.dayCheckInterval) {
      clearInterval(this.dayCheckInterval);
      this.dayCheckInterval = null;
    }

    this.isActive = false;
    logInfo("WatchMode", "Watch mode stopped");
  }

  status() {
    return {
      mode: "watch",
      active: this.isActive,
      watchPath: this.currentWatchPath,
      todaysPath: this.getTodaysInputPath(),
    };
  }
}

module.exports = WatchMode;
