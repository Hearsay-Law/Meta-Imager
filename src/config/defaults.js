// src/config/defaults.js
const defaultConfig = {
  processing: {
    addWatermark: true,
    // Add other processing options here as we expand
  },
  // New section for runtime settings
  runtime: {
    currentTargetSubfolder: null, // null or "" can represent the default (no subfolder)
  },
  // Add other configuration categories as needed
};

module.exports = defaultConfig;
