const fs = require("fs").promises;
const path = require("path");
const sharp = require("sharp");
const { keywordsMap } = require("./keywords");
const KeywordMatcher = require("./services/keywordMatcher");
const exifToolService = require("./services/exifToolService");
const {
  formatKeywordsLog,
  formatKeywordsTable,
} = require("./services/colorLogger");
const {
  logSuccess,
  logError,
  logWarning,
  logInfo,
  logDebug,
} = require("./services/logger");

const keywordMatcher = new KeywordMatcher(keywordsMap);

async function processFile(filePath, destOutputDir) {
  const operation = "ProcessFile";
  let filename;

  try {
    filename = path.basename(filePath);
    logInfo(operation, `Starting processing: ${filename}`);

    if (!filename.toLowerCase().endsWith(".png")) {
      logWarning(operation, `Skipping non-PNG file: ${filename}`);
      return false;
    }

    const metadata = await sharp(filePath).metadata();
    let originalPrompts = [];
    let matchedKeywords = [];

    if (!metadata.comments) {
      logWarning(operation, `No comments found in metadata`, { filename });
      return false;
    }

    const promptComment = metadata.comments.find(
      (comment) => comment.keyword === "prompt"
    );

    if (!promptComment) {
      logWarning(operation, `No prompt comment found in metadata`, {
        filename,
      });
      return false;
    }

    try {
      const promptData = JSON.parse(promptComment.text);
      logDebug(operation, "Parsed prompt data", { filename, promptData });

      // Process all entries for both prompts and keywords
      for (const [key, value] of Object.entries(promptData)) {
        if (value.inputs && value.inputs.populated_text) {
          // Store original prompts
          originalPrompts.push({
            entryKey: key,
            originalText: value.inputs.populated_text,
          });

          // Get keywords using the keyword matcher service
          const keywords = keywordMatcher.findKeywords(
            value.inputs.populated_text
          );
          matchedKeywords.push(...keywords);
        }
      }

      if (originalPrompts.length === 0) {
        logWarning(operation, `No valid prompts found`, { filename });
        return false;
      }

      // Remove duplicates from matchedKeywords
      matchedKeywords = [...new Set(matchedKeywords)];

      if (matchedKeywords.length > 0) {
        logInfo(
          "ProcessFile",
          `Found keywords:\n${formatKeywordsTable(matchedKeywords)}`
        );
        // logInfo(operation, `Found keywords`, {
        //   matchedKeywords,
        // });
      }

      // Create new image with added metadata
      const outputPath = path.join(destOutputDir, filename);

      // First create the output file with EXIF description using Sharp
      await sharp(filePath)
        .withMetadata({
          iccp: "sRGB",
          exif: {
            IFD0: {
              ImageDescription: originalPrompts[0].originalText,
            },
          },
        })
        .toFile(outputPath);

      // Then add IPTC keywords using exiftool service
      await exifToolService.writeMetadata(outputPath, {
        Keywords: matchedKeywords,
      });

      logSuccess(operation, `Successfully processed: ${filename}`);

      return true;
    } catch (jsonError) {
      logError(operation, jsonError, {
        filename,
        context: "JSON parsing",
        rawData: promptComment.text,
      });
      return false;
    }
  } catch (error) {
    logError(operation, error, { filename });
    return false;
  }
}

module.exports = {
  processFile,
};
