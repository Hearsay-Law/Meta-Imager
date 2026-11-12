// src/services/loraExtractor.js
"use strict";

// Reads the loras an image was made with from its "parameters" text, where
// ComfyUI's "Save Image With Metadata" node writes lines like
//   Lora_0 Model name: film_grain_v2.safetensors, Lora_0 Strength model: 0.8, ...
// (after "Negative prompt:", so this never touches the prompt/description).

const LORA_NAME = /Lora_\d+ Model name: ([^,\n]+)/g;
const MODEL_EXTENSION = /\.(safetensors|ckpt|pt|pth|bin)$/i;

// "SD1.5\film_grain_v2.safetensors" -> "film_grain_v2"
function loraKey(fileName) {
  const base = fileName.trim().split(/[\\/]/).pop();
  return base.replace(MODEL_EXTENSION, "");
}

// Lora names (no folder, no extension) in the order they appear, without repeats.
function extractLoraNames(metadata) {
  const parameters = metadata?.comments?.find(
    (comment) => comment.keyword === "parameters"
  )?.text;
  if (!parameters) return [];

  const names = [];
  for (const match of parameters.matchAll(LORA_NAME)) {
    const name = loraKey(match[1]);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

module.exports = { extractLoraNames, loraKey };
