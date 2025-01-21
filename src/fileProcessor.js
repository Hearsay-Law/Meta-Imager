const fs = require("fs").promises;
const path = require("path");
const sharp = require("sharp");
const { keywordsMap } = require("./keywords");
const KeywordMatcher = require("./services/keywordMatcher");
const exifToolService = require("./services/exifToolService");
const { addWatermark } = require("./services/watermarkService");
const tempFileService = require("./services/tempFileService");

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
  const tempFiles = [];

  try {
    // Ensure temp directory exists
    await tempFileService.ensureTempDir();

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
      }

      // Create new image with added metadata
      const outputPath = path.join(destOutputDir, filename);

      // Get temporary file paths
      const tempBasePath = tempFileService.getTempFilePath(
        "process_",
        path.extname(filename)
      );
      const tempWatermarkPath = tempFileService.getTempFilePath(
        "watermark_",
        path.extname(filename)
      );
      tempFiles.push(tempBasePath, tempWatermarkPath);

      // First create a temporary file with color profile using Sharp
      await sharp(filePath)
        .withMetadata({
          iccp: "sRGB",
        })
        .toFile(tempBasePath);

      // Add watermark to the temp file and save to another temp file
      await addWatermark(tempBasePath, tempWatermarkPath);

      // Copy the watermarked temp file to final destination
      await fs.copyFile(tempWatermarkPath, outputPath);

      // Add both description and keywords using exiftool
      await exifToolService.writeMetadata(outputPath, {
        Description: originalPrompts[0].originalText,
        ImageDescription: originalPrompts[0].originalText,
        Keywords: matchedKeywords,
      });

      // Clean up any _original files that exiftool might have created
      await tempFileService.cleanupOriginal(outputPath);

      logSuccess(operation, `Successfully processed: ${filename}`, {
        description: originalPrompts[0].originalText.substring(0, 100) + "...",
        keywordCount: matchedKeywords.length,
      });

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
  } finally {
    // Clean up all temporary files
    for (const tempFile of tempFiles) {
      await tempFileService.cleanup(tempFile);
    }
  }
}

module.exports = {
  processFile,
};
