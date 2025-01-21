const { logError } = require("../../services/logger");

class ProcessingMode {
  constructor(fileProcessor) {
    this.fileProcessor = fileProcessor;
    this.isActive = false;
  }

  async start() {
    throw new Error("start() must be implemented");
  }

  async stop() {
    throw new Error("stop() must be implemented");
  }

  status() {
    return {
      mode: "abstract",
      active: this.isActive,
    };
  }

  handleError(operation, error, metadata = {}) {
    logError(operation, error, { mode: this.constructor.name, ...metadata });
  }
}

module.exports = ProcessingMode;
