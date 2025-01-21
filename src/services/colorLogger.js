const chalk = require("chalk");
const Table = require("cli-table3");

// Simple hash function to generate consistent numbers from strings
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Predefined set of distinct colors to cycle through
const colors = [
  "#FF6B6B", // coral red
  "#4ECDC4", // turquoise
  "#45B7D1", // sky blue
  "#96CEB4", // sage green
  "#FFEEAD", // cream yellow
  "#D4A5A5", // dusty rose
  "#9B59B6", // purple
  "#3498DB", // blue
  "#E67E22", // orange
  "#1ABC9C", // emerald
];

function getColorForKeyword(keyword) {
  const colorIndex = hashString(keyword) % colors.length;
  return colors[colorIndex];
}

function formatKeywordsTable(keywords) {
  // Constants for table layout
  const CONSOLE_WIDTH = 60; // Standard console width
  const MIN_COLUMN_WIDTH = 20;
  const PADDING_AND_BORDERS = 4; // Account for cell padding and borders

  // Calculate number of columns that can fit
  const maxKeywordLength = Math.max(...keywords.map((k) => k.length));
  const columnWidth = Math.max(
    maxKeywordLength + PADDING_AND_BORDERS,
    MIN_COLUMN_WIDTH
  );
  const numColumns = Math.max(1, Math.floor(CONSOLE_WIDTH / columnWidth));

  // Create rows array for the table
  const rows = [];
  for (let i = 0; i < keywords.length; i += numColumns) {
    const row = keywords.slice(i, i + numColumns).map((keyword) => {
      const color = getColorForKeyword(keyword);
      return chalk.hex(color)(keyword);
    });

    // Pad the row if it's not complete
    while (row.length < numColumns) {
      row.push("");
    }

    rows.push(row);
  }

  // Create and configure table
  const table = new Table({
    chars: {
      top: "─",
      "top-mid": "┬",
      "top-left": "┌",
      "top-right": "┐",
      bottom: "─",
      "bottom-mid": "┴",
      "bottom-left": "└",
      "bottom-right": "┘",
      left: "│",
      "left-mid": "├",
      mid: "─",
      "mid-mid": "┼",
      right: "│",
      "right-mid": "┤",
      middle: "│",
    },
    style: {
      border: ["grey"],
      head: ["white"],
    },
    colWidths: Array(numColumns).fill(columnWidth),
    colAligns: Array(numColumns).fill("middle"),
    wordWrap: true,
  });

  // Add all rows to the table
  rows.forEach((row) => table.push(row));

  return table.toString();
}

module.exports = {
  formatKeywordsTable,
  getColorForKeyword, // exported for testing purposes
};
