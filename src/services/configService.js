//src/services/configService.js
const fs = require("fs").promises;
const path = require("path");
const defaultConfig = require("../config/defaults");
const { logInfo, logError } = require("./logger");

class ConfigService {
  constructor() {
    this.configPath = path.join(process.cwd(), "config.json");
    this.config = null;
  }

  async load() {
    try {
      const configExists = await this.checkConfigFile();

      if (!configExists) {
        // If no config file exists, create one with defaults
        await this.save(defaultConfig);
        this.config = { ...defaultConfig };
        logInfo(
          "ConfigService",
          "Created new configuration file with defaults"
        );
      } else {
        // Load existing config and merge with defaults to ensure all fields exist
        const fileContent = await fs.readFile(this.configPath, "utf8");
        const savedConfig = JSON.parse(fileContent);
        this.config = this.mergeWithDefaults(savedConfig);
        logInfo("ConfigService", "Loaded existing configuration");
      }
    } catch (error) {
      logError("ConfigService", error, { context: "loading configuration" });
      // Fall back to defaults if loading fails
      this.config = { ...defaultConfig };
    }
  }

  async checkConfigFile() {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  mergeWithDefaults(savedConfig) {
    // Deep merge saved config with defaults to ensure all required fields exist
    const merged = { ...defaultConfig };

    for (const [key, value] of Object.entries(savedConfig)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        merged[key] = { ...defaultConfig[key], ...value };
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  async save(newConfig = this.config) {
    try {
      const configToSave = this.mergeWithDefaults(newConfig);
      await fs.writeFile(
        this.configPath,
        JSON.stringify(configToSave, null, 2),
        "utf8"
      );
      this.config = configToSave;
      logInfo("ConfigService", "Configuration saved successfully");
    } catch (error) {
      logError("ConfigService", error, { context: "saving configuration" });
      throw error;
    }
  }

  get(path) {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }

    const parts = path.split(".");
    let result = this.config;

    for (const part of parts) {
      if (result && typeof result === "object") {
        result = result[part];
      } else {
        return undefined;
      }
    }

    return result;
  }

  async update(path, value) {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }

    const parts = path.split(".");
    let current = this.config;

    // Navigate to the nested location
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    // Update the value
    current[parts[parts.length - 1]] = value;

    // Save the updated configuration
    await this.save();

    return this.config;
  }

  getAll() {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }
    return { ...this.config };
  }
}

// Create and export a singleton instance
const configService = new ConfigService();

module.exports = configService;
