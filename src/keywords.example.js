// Example keywords map for image categorization
// Copy this file to keywords.js and customize the mappings

const keywordsMap = {
  // Format: 'detected_term': 'Category: Descriptive Label'

  // Time of Day
  sunset: "TimeOfDay: Sunset",
  sunrise: "TimeOfDay: Sunrise",
  night: "TimeOfDay: Night",
  daytime: "TimeOfDay: Day",

  // Landscape Features
  mountain: "Landscape: Mountain",
  beach: "Landscape: Beach",
  forest: "Landscape: Forest",
  desert: "Landscape: Desert",

  // Weather
  cloudy: "Weather: Overcast",
  sunny: "Weather: Clear",
  rainy: "Weather: Rain",
  stormy: "Weather: Storm",

  // Trees
  oak: "Tree: Oak",
  pine: "Tree: Pine",
  maple: "Tree: Maple",

  // Materials
  brick: "Material: Brick",
  wooden: "Material: Wood",
  marble: "Material: Marble",

  // Add more keywords as needed...
};

module.exports = { keywordsMap };
