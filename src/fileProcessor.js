// src/fileProcessor.js
"use strict";

const fs = require("fs").promises;
const path = require("path");
const sharp = require("sharp");
const { keywordsMap } = require("./keywords");
const KeywordMatcher = require("./services/keywordMatcher");
const exifToolService = require("./services/exifToolService");
const { addWatermark } = require("./services/watermarkService");
const tempFileService = require("./services/tempFileService");
const configService = require("./services/configService");
const PromptExtractionService = require("./services/promptExtraction/promptExtractionService");
const ParametersStrategy = require("./services/promptExtraction/strategies/parametersStrategy");
const JsonPromptStrategy = require("./services/promptExtraction/strategies/jsonPromptStrategy");

const { formatKeywordsTable } = require("./services/colorLogger");
const {
  logSuccess,
  logError,
  logWarning,
  logInfo,
  logDebug,
} = require("./services/logger");

const keywordMatcher = new KeywordMatcher(keywordsMap);
const logger = {
  logSuccess,
  logError,
  logWarning,
  logInfo,
  logDebug,
};

const promptExtractor = new PromptExtractionService(
  [ParametersStrategy, JsonPromptStrategy],
  logger
);

async function processFile(filePath, destOutputDir) {
  const operation = "ProcessFile";
  let filename;
  const tempFiles = [];

  try {
    await tempFileService.ensureTempDir();
    filename = path.basename(filePath);
    logInfo(
      operation,
      `Starting processing: ${filename} for output to ${destOutputDir}`
    ); // Added destOutputDir for clarity

    if (!filename.toLowerCase().endsWith(".png")) {
      logWarning(operation, `Skipping non-PNG file: ${filename}`);
      return false;
    }

    const metadata = await sharp(filePath).metadata();
    let matchedKeywords = [];

    if (!metadata.comments) {
      logWarning(operation, `No comments found in metadata`, { filename });
      return false;
    }

    const extractionResult = await promptExtractor.extractPrompts(metadata);

    if (!extractionResult) {
      logWarning(
        operation,
        `No valid prompts found using any available strategy`,
        { filename }
      );
      return false;
    }

    const { prompts } = extractionResult;
    logDebug(operation, "Extracted prompts", {
      filename,
      strategy: extractionResult.strategy,
      promptCount: prompts.length,
      firstPrompt: prompts[0].originalText.substring(0, 100) + "...",
    });

    // Process keywords for all prompts
    for (const prompt of prompts) {
      const keywords = keywordMatcher.findKeywords(prompt.originalText);
      matchedKeywords.push(...keywords);
    }

    // Remove duplicates
    matchedKeywords = [...new Set(matchedKeywords)];

    if (configService.get("processing.addWatermark")) {
      matchedKeywords.push("Watermark: AI");
    }

    if (matchedKeywords.length > 1) {
      // Corrected from > 1 to > 0 or just log always if desired
      logInfo(
        operation,
        `Found keywords:\n${formatKeywordsTable(matchedKeywords)}`
      );
    }

    const outputPath = path.join(destOutputDir, filename);

    // --- New/Modified Section: Ensure output directory exists ---
    // This ensures the specific target directory (which might be a subfolder) exists.
    try {
      await fs.mkdir(destOutputDir, { recursive: true });
      logDebug(operation, `Ensured output directory exists: ${destOutputDir}`, {
        filename,
      });
    } catch (dirError) {
      logError(
        operation,
        `Failed to create output directory: ${destOutputDir}. Error: ${dirError.message}`,
        { filename }
      );
      // Depending on desired behavior, you might want to throw this error
      // or return false to indicate processing failure due to directory issue.
      throw new Error(
        `Cannot create output directory ${destOutputDir}: ${dirError.message}`
      );
    }
    // --- End New/Modified Section ---

    const tempBasePath = tempFileService.getTempFilePath(
      "process_",
      path.extname(filename)
    );
    const tempWatermarkPath = tempFileService.getTempFilePath(
      "watermark_",
      path.extname(filename)
    );
    tempFiles.push(tempBasePath, tempWatermarkPath);

    await sharp(filePath)
      .withMetadata({
        iccp: "sRGB",
      })
      .toFile(tempBasePath);

    if (configService.get("processing.addWatermark")) {
      await addWatermark(tempBasePath, tempWatermarkPath);
      await fs.copyFile(tempWatermarkPath, outputPath);
    } else {
      await fs.copyFile(tempBasePath, outputPath);
    }

    await exifToolService.writeMetadata(outputPath, {
      Description: prompts[0].originalText,
      ImageDescription: prompts[0].originalText,
      Keywords: matchedKeywords,
    });

    await tempFileService.cleanupOriginal(outputPath);

    logSuccess(operation, `Successfully processed: ${filename}`, {
      description: prompts[0].originalText.substring(0, 100) + "...",
      keywordCount: matchedKeywords.length,
      strategy: extractionResult.strategy,
      output: outputPath, // Added output path to success log
    });

    return true;
  } catch (error) {
    logError(operation, error, {
      filename,
      outputPath: path.join(destOutputDir, filename || "unknown_file"),
    });
    return false;
  } finally {
    for (const tempFile of tempFiles) {
      await tempFileService.cleanup(tempFile);
    }
  }
}

module.exports = {
  processFile,
};
