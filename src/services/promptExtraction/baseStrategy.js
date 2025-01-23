// src/services/promptExtraction/baseStrategy.js
"use strict";

class BasePromptStrategy {
  extractPrompt(metadata, logger) {
    throw new Error("extractPrompt method must be implemented by subclass");
  }
}

module.exports = BasePromptStrategy;
