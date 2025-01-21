const fs = require("fs").promises;
const path = require("path");
const ProcessingMode = require("./ProcessingMode");
const { logInfo, logDebug, logWarning } = require("../../services/logger");

class BatchMode extends ProcessingMode {
  constructor(fileProcessor, directoryPath) {
    super(fileProcessor);
    this.directoryPath = directoryPath;
    this.processedCount = 0;
    this.totalFiles = 0;
    this.isProcessing = false;
  }

  async validateDirectory() {
    try {
      await fs.access(this.directoryPath);
      const stats = await fs.stat(this.directoryPath);
      if (!stats.isDirectory()) {
        throw new Error("Path is not a directory");
      }
    } catch (error) {
      this.handleError("Validation", error, { path: this.directoryPath });
      throw error;
    }
  }

  async getPngFiles() {
    try {
      const files = await fs.readdir(this.directoryPath);
      return files.filter((file) => file.toLowerCase().endsWith(".png"));
    } catch (error) {
      this.handleError("FileSearch", error);
      throw error;
    }
  }

  async processAllFiles() {
    try {
      const pngFiles = await this.getPngFiles();
      this.totalFiles = pngFiles.length;
      this.processedCount = 0;
      this.isProcessing = true;

      if (this.totalFiles === 0) {
        logWarning("BatchMode", "No PNG files found in directory", {
          path: this.directoryPath,
        });
        return;
      }

      logInfo("BatchMode", `Starting to process ${this.totalFiles} PNG files`);

      for (const filename of pngFiles) {
        if (!this.isActive) {
          logInfo("BatchMode", "Processing stopped by user");
          break;
        }

        const filePath = path.join(this.directoryPath, filename);
        try {
          await this.fileProcessor.processFile(filePath);
          this.processedCount++;
          logInfo(
            "BatchMode",
            `Progress: ${this.processedCount}/${this.totalFiles} files processed`
          );
        } catch (error) {
          this.handleError("Processing", error, { filename });
          // Continue with next file even if this one fails
        }
      }

      logInfo(
        "BatchMode",
        `Completed processing ${this.processedCount}/${this.totalFiles} files`
      );
    } catch (error) {
      this.handleError("BatchProcessing", error);
    } finally {
      this.isProcessing = false;
    }
  }

  async start() {
    try {
      await this.validateDirectory();
      this.isActive = true;
      this.processAllFiles(); // Don't await - let it run in background
      logInfo("BatchMode", "Batch mode started successfully");
    } catch (error) {
      this.handleError("Start", error);
      throw error;
    }
  }

  async stop() {
    this.isActive = false;
    logInfo("BatchMode", "Batch mode stopped");
  }

  status() {
    return {
      mode: "batch",
      active: this.isActive,
      directory: this.directoryPath,
      isProcessing: this.isProcessing,
      progress: {
        processed: this.processedCount,
        total: this.totalFiles,
        percentage: this.totalFiles
          ? Math.round((this.processedCount / this.totalFiles) * 100)
          : 0,
      },
    };
  }
}

module.exports = BatchMode;
