// src/services/promptExtraction/strategies/parametersStrategy.js
"use strict";

const BasePromptStrategy = require("../baseStrategy");

class ParametersStrategy extends BasePromptStrategy {
  static identifier = "parameters";

  extractPrompt(metadata, logger) {
    const promptComment = metadata.comments?.find(
      (comment) => comment.keyword === "parameters"
    );
    if (!promptComment) {
      logger?.logDebug("ParametersStrategy", "No parameters comment found");
      return null;
    }

    logger?.logDebug("ParametersStrategy", "Found parameters comment", {
      text: promptComment.text,
    });

    const negIndex = promptComment.text.indexOf("Negative prompt:");
    const positivePrompt =
      negIndex > -1
        ? promptComment.text.substring(0, negIndex).trim()
        : promptComment.text.trim();

    if (!positivePrompt) {
      logger?.logDebug("ParametersStrategy", "No positive prompt text found");
      return null;
    }

    return [
      {
        entryKey: "primary",
        originalText: positivePrompt,
      },
    ];
  }
}

module.exports = ParametersStrategy;
