const winston = require("winston");
const chalk = require("chalk");

// Custom format for console output
const consoleFormat = winston.format.printf(
  ({ level, message, timestamp, ...metadata }) => {
    // Color schemes
    const levelColors = {
      error: chalk.bold.red,
      warn: chalk.bold.yellow,
      info: chalk.bold.blue,
      debug: chalk.bold.green,
      verbose: chalk.bold.cyan,
    };

    // Format timestamp
    const time = chalk.gray(new Date(timestamp).toLocaleTimeString());

    // Format level
    const coloredLevel = levelColors[level](level.toUpperCase().padEnd(7));

    // Format metadata if present
    let metadataStr = "";
    if (Object.keys(metadata).length > 0) {
      metadataStr = chalk.gray(JSON.stringify(metadata));
    }

    // Return formatted string
    return `${time} ${coloredLevel} ${chalk.white(message)} ${metadataStr}`;
  }
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    // Console transport with custom formatting
    new winston.transports.Console({
      format: winston.format.combine(winston.format.timestamp(), consoleFormat),
    }),
    // File transport for errors
    new winston.transports.File({
      filename: "error.log",
      level: "error",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: "combined.log",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ],
});

// Helper functions for structured logging
const logSuccess = (operation, message, metadata = {}) => {
  logger.info(`✓ ${operation}: ${message}`, { operation, ...metadata });
};

const logError = (operation, error, metadata = {}) => {
  logger.error(`✗ ${operation}: ${error.message}`, {
    operation,
    error: {
      message: error.message,
      stack: error.stack,
      ...error,
    },
    ...metadata,
  });
};

const logWarning = (operation, message, metadata = {}) => {
  logger.warn(`⚠ ${operation}: ${message}`, { operation, ...metadata });
};

const logInfo = (operation, message, metadata = {}) => {
  logger.info(`ℹ ${operation}: ${message}`, { operation, ...metadata });
};

const logDebug = (operation, message, metadata = {}) => {
  logger.debug(`🔍 ${operation}: ${message}`, { operation, ...metadata });
};

module.exports = {
  logger,
  logSuccess,
  logError,
  logWarning,
  logInfo,
  logDebug,
};
