const { logDebug } = require("./logger");

class KeywordMatcher {
  constructor(keywordsMap) {
    this.normalizedKeywordsMap = this.normalizeKeywordsMap(keywordsMap);
    // Create an array of keywords sorted by length (longest first) to prioritize longer matches
    this.sortedKeywords = Object.keys(this.normalizedKeywordsMap).sort(
      (a, b) => b.length - a.length
    );
  }

  normalizeKeywordsMap(keywordsMap) {
    return Object.entries(keywordsMap).reduce((acc, [key, value]) => {
      // Handle both the original key and the space-removed version
      const normalizedKey = key.toLowerCase().trim();
      const keyWithoutSpaces = normalizedKey.replace(/\s+/g, "");

      acc[normalizedKey] = value;
      acc[keyWithoutSpaces] = value;
      return acc;
    }, {});
  }

  cleanTerm(term) {
    // Remove anything after and including a colon
    let cleaned = term.replace(/:[^,]*/, "");
    // Remove parentheses
    cleaned = cleaned.replace(/[()]/g, "");
    // Trim any remaining whitespace and convert to lowercase
    cleaned = cleaned.trim().toLowerCase();
    // Replace multiple spaces with single space
    cleaned = cleaned.replace(/\s+/g, " ");
    return cleaned;
  }

  findMatchAtStart(text) {
    // Try to match the beginning of the text with any known keyword
    const normalizedText = text.toLowerCase();

    // First try space-preserved matches
    for (const keyword of this.sortedKeywords) {
      if (normalizedText.startsWith(keyword)) {
        const remainingText = normalizedText.slice(keyword.length).trim();
        return {
          match: this.normalizedKeywordsMap[keyword],
          remainingText,
        };
      }
    }

    // Then try space-removed matches
    const textWithoutSpaces = normalizedText.replace(/\s+/g, "");
    for (const keyword of this.sortedKeywords) {
      const keywordWithoutSpaces = keyword.replace(/\s+/g, "");
      if (textWithoutSpaces.startsWith(keywordWithoutSpaces)) {
        // Calculate the original length with spaces by finding where the normalized match ends
        const originalLength = normalizedText.indexOf(keyword) + keyword.length;
        const remainingText = normalizedText.slice(originalLength).trim();
        return {
          match: this.normalizedKeywordsMap[keyword],
          remainingText,
        };
      }
    }

    return null;
  }

  findKeywordsInPhrase(phrase) {
    const matches = new Set();
    let remainingText = this.cleanTerm(phrase);

    logDebug("KeywordMatcher", `Processing phrase: ${remainingText}`);

    while (remainingText) {
      const result = this.findMatchAtStart(remainingText);
      if (!result) {
        const words = remainingText.split(/\s+/);
        remainingText = words.slice(1).join(" ");
        continue;
      }

      // Handle both single strings and arrays
      if (Array.isArray(result.match)) {
        result.match.forEach((match) => matches.add(match));
      } else {
        matches.add(result.match);
      }

      remainingText = result.remainingText;
    }

    return Array.from(matches);
  }

  findKeywords(text) {
    const matchedKeywords = new Set();

    // Split by commas first
    const phrases = text.split(",");

    // Process each phrase
    phrases.forEach((phrase) => {
      const matches = this.findKeywordsInPhrase(phrase);
      matches.forEach((match) => matchedKeywords.add(match));
    });

    return Array.from(matchedKeywords);
  }
}

module.exports = KeywordMatcher;
