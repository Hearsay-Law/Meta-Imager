const sharp = require("sharp");

async function addWatermark(inputPath, outputPath) {
  try {
    // Create a new SVG with the watermark text and background rectangle
    const watermarkSvg = `
      <svg width="100" height="20">
        <style>
          .watermark-bg {
            fill: rgba(0, 0, 0, 0.5);
          }
          .watermark-text {
            fill: rgba(255, 255, 255, 0.8);
            font-size: 14px;
            font-family: Arial, sans-serif;
          }
        </style>
        <!-- Background rectangle -->
        <rect x="0" y="0" width="100" height="20" class="watermark-bg" />
        <!-- Watermark text -->
        <text x="90" y="15" class="watermark-text" text-anchor="end">AI Generated</text>
      </svg>
    `;

    // Get the dimensions of the input image
    const metadata = await sharp(inputPath).metadata();

    // Add the watermark to the image
    await sharp(inputPath)
      .composite([
        {
          input: Buffer.from(watermarkSvg),
          gravity: "southeast", // Position in bottom-right corner
          blend: "over",
        },
      ])
      .toFile(outputPath);
  } catch (error) {
    console.error("Error adding watermark:", error);
    throw error;
  }
}

module.exports = {
  addWatermark,
};
