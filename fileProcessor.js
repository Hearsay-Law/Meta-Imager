const fs = require("fs").promises;
const path = require("path");
const sharp = require("sharp");
const { keywordsMap } = require("./keywords");
const { exiftool } = require("exiftool-vendored");

function cleanTerm(term) {
  // Remove anything after and including a colon
  let cleaned = term.replace(/:[^,]*/, "");
  // Remove parentheses
  cleaned = cleaned.replace(/[()]/g, "");
  // Trim any remaining whitespace and convert to lowercase
  cleaned = cleaned.trim().toLowerCase();
  return cleaned;
}

async function processFile(filePath, destReviewDir, destOutputDir) {
  try {
    const filename = path.basename(filePath);
    console.log(`Processing file: ${filename}`);

    if (!filename.toLowerCase().endsWith(".png")) {
      console.log(`Skipping non-PNG file: ${filename}`);
      return false;
    }

    const metadata = await sharp(filePath).metadata();
    let originalPrompts = [];
    let matchedKeywords = new Set();

    if (metadata.comments) {
      const promptComment = metadata.comments.find(
        (comment) => comment.keyword === "prompt"
      );
      if (promptComment) {
        try {
          const promptData = JSON.parse(promptComment.text);

          // Process all entries for both prompts and keywords
          for (const [key, value] of Object.entries(promptData)) {
            if (value.inputs && value.inputs.populated_text) {
              // Store original prompts
              originalPrompts.push({
                entryKey: key,
                originalText: value.inputs.populated_text,
              });

              // Process terms for keyword matching
              const terms = value.inputs.populated_text
                .split(",")
                .map((term) => cleanTerm(term));

              // Check each term against our keywords
              terms.forEach((term) => {
                if (keywordsMap[term]) {
                  matchedKeywords.add(keywordsMap[term]);
                }
              });
            }
          }

          if (originalPrompts.length > 0) {
            // Convert Set to Array
            const keywordsArray = Array.from(matchedKeywords);

            if (keywordsArray.length > 0) {
              console.log("Matched Keywords:", keywordsArray);
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

            // Then add IPTC keywords using exiftool
            await exiftool.write(outputPath, {
              Keywords: keywordsArray,
            });

            console.log(`Added metadata and saved to: ${outputPath}`);
            console.log("Added description:", originalPrompts[0].originalText);
            console.log("Added keywords:", keywordsArray);

            // Move original to reviewed directory
            const reviewedPath = path.join(destReviewDir, filename);
            await fs.rename(filePath, reviewedPath);
            console.log(`Moved original to: ${reviewedPath}`);
          }
        } catch (jsonError) {
          console.log("Error processing JSON:", jsonError);
          console.log("Raw data:", promptComment.text);
          return false;
        }
      } else {
        console.log("No prompt comment found in metadata");
        return false;
      }
    } else {
      console.log("No comments found in metadata");
      return false;
    }

    // Clean up exiftool process
    await exiftool.end();

    return true;
  } catch (error) {
    console.error(`Error processing file ${filename}:`, error);
    // Clean up exiftool process even if there's an error
    await exiftool.end();
    return false;
  }
}

module.exports = {
  processFile,
};
