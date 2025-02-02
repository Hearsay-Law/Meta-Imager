const { exiftool } = require("exiftool-vendored");
const path = require("path");
const { logError, logDebug } = require("./logger");
const tempFileService = require("./tempFileService");

class ExifToolService {
  constructor() {
    this.instance = exiftool;
    this.isShuttingDown = false;

    // Handle process exit
    process.on("SIGINT", this.cleanup.bind(this));
    process.on("SIGTERM", this.cleanup.bind(this));
  }

  async writeMetadata(filePath, metadata) {
    if (this.isShuttingDown) {
      throw new Error("ExifTool service is shutting down");
    }

    const tempPath = filePath + "_tmp";

    try {
      logDebug("ExifTool", `Writing metadata to ${filePath}`, { metadata });

      // Write to a temp file first
      await this.instance.write(filePath, metadata);

      // After the write completes successfully, try to rename the temp file
      try {
        await this.instance.write(filePath, {}, ["-delete_original!"]);
      } catch (error) {
        logError("ExifTool", error, { context: "cleanup attempt" });
      }
    } catch (error) {
      logError("ExifTool", error, { filePath, metadata });
      throw error;
    }
  }

  async cleanup() {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    try {
      await this.instance.end();
      logDebug("ExifTool", "Successfully cleaned up ExifTool process");
    } catch (error) {
      logError("ExifTool", error, { context: "cleanup" });
    }
  }
}

// Create a singleton instance
const exifToolService = new ExifToolService();

module.exports = exifToolService;
