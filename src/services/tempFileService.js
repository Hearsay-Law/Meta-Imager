const fs = require("fs").promises;
const path = require("path");
const { logError, logDebug } = require("./logger");

class TempFileService {
  constructor() {
    this.tempDir = path.join(process.cwd(), "temp");
  }

  async ensureTempDir() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
      logDebug("TempFileService", `Created temp directory at ${this.tempDir}`);
    }
  }

  async getTempDir() {
    await this.ensureTempDir();
    return this.tempDir;
  }

  getTempFilePath(prefix = "temp_", extension = "") {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    return path.join(
      this.tempDir,
      `${prefix}${timestamp}_${randomStr}${extension}`
    );
  }

  async cleanup(filePath) {
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      logDebug(
        "TempFileService",
        `Cleaned up temp file: ${path.basename(filePath)}`
      );
    } catch (error) {
      if (error.code !== "ENOENT") {
        logError("TempFileService", error, { context: "cleanup", filePath });
      }
    }
  }

  async cleanupOriginal(outputPath) {
    const originalPath = outputPath.replace(/(\.[^.]+)$/, "_original$1");
    try {
      await fs.access(originalPath);
      await fs.unlink(originalPath);
      logDebug(
        "TempFileService",
        `Cleaned up original file: ${path.basename(originalPath)}`
      );
    } catch (error) {
      // If file doesn't exist, that's fine
      if (error.code !== "ENOENT") {
        logError("TempFileService", error, {
          context: "cleanupOriginal",
          originalPath,
        });
      }
    }
  }
}

module.exports = new TempFileService();
