// src/services/promptExtraction/promptExtractionService.js
"use strict";

class PromptExtractionService {
  constructor(strategies = [], logger = null) {
    this.strategies = strategies;
    this.logger = logger;
  }

  async extractPrompts(metadata) {
    for (const Strategy of this.strategies) {
      try {
        const strategy = new Strategy();
        this.logger?.logDebug(
          "PromptExtraction",
          `Trying strategy: ${Strategy.identifier}`
        );

        const result = strategy.extractPrompt(metadata, this.logger);
        if (result) {
          this.logger?.logDebug(
            "PromptExtraction",
            `Strategy ${Strategy.identifier} succeeded`,
            {
              promptCount: result.length,
            }
          );
          return {
            strategy: Strategy.identifier,
            prompts: result,
          };
        }
      } catch (error) {
        this.logger?.logError("PromptExtraction", error, {
          strategy: Strategy.identifier,
        });
        continue;
      }
    }
    return null;
  }
}

module.exports = PromptExtractionService;
