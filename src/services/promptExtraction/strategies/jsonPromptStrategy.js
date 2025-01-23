// src/services/promptExtraction/strategies/jsonPromptStrategy.js
"use strict";

const BasePromptStrategy = require("../baseStrategy");

class JsonPromptStrategy extends BasePromptStrategy {
  static identifier = "jsonPrompt";

  extractPrompt(metadata, logger) {
    const promptComment = metadata.comments?.find(
      (comment) => comment.keyword === "prompt"
    );
    if (!promptComment) {
      logger?.logDebug("JsonPromptStrategy", "No prompt comment found");
      return null;
    }

    try {
      const promptData = JSON.parse(promptComment.text);
      logger?.logDebug("JsonPromptStrategy", "Parsed prompt data", {
        promptData,
      });

      const prompts = [];
      for (const [key, value] of Object.entries(promptData)) {
        if (value.inputs?.populated_text) {
          prompts.push({
            entryKey: key,
            originalText: value.inputs.populated_text,
          });
        }
      }

      if (prompts.length === 0) {
        logger?.logDebug(
          "JsonPromptStrategy",
          "No valid prompts found in JSON data"
        );
        return null;
      }

      return prompts;
    } catch (error) {
      logger?.logError("JsonPromptStrategy", error, {
        context: "JSON parsing",
        rawData: promptComment.text,
      });
      return null;
    }
  }
}

module.exports = JsonPromptStrategy;
