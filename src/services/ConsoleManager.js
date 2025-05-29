"use strict";

const readline = require("readline");
const inquirer = require("inquirer"); // inquirer@8 for CommonJS
const { EventEmitter } = require("events");
const { logInfo, logError } = require("./logger"); // Adjust path if your logger is elsewhere
// If you have logWarning, you can import it. Otherwise, adapt the catch block.

class ConsoleManager extends EventEmitter {
  constructor() {
    super();
    this.isPrompting = false; // To prevent multiple inquirer prompts at once
    this._keypressListener = null; // To store our specific keypress listener
  }

  start() {
    if (!process.stdin.isTTY) {
      logInfo("ConsoleManager", "Not a TTY. Console commands disabled.");
      return;
    }

    readline.emitKeypressEvents(process.stdin);

    // Ensure raw mode is on for single key presses
    // Note: process.stdin.isRaw might be false here if already manipulated,
    // but setRawMode(true) is what we want.
    try {
      process.stdin.setRawMode(true);
    } catch (e) {
      logError("ConsoleManager", "Failed to set raw mode on stdin.", e);
      // If raw mode fails, console manager might not work as expected.
      // Depending on strictness, could return or throw.
      return;
    }

    // Explicitly resume stdin in case it starts paused or was left paused.
    // readline.emitKeypressEvents and attaching a 'data' or 'keypress' listener
    // often implicitly resumes it, but being explicit is safer.
    process.stdin.resume();

    this._keypressListener = async (str, key) => {
      if (this.isPrompting) {
        // If inquirer is prompting, it handles its own input.
        // Our listener is removed during inquirer's prompt, so this path
        // is unlikely to be hit for Ctrl+C during an active Inquirer prompt.
        // Inquirer itself should handle Ctrl+C (e.g., by rejecting its promise).
        if (key && key.ctrl && key.name === "c") {
          logInfo(
            "ConsoleManager",
            "Ctrl+C pressed (listener active during prompt - unexpected)."
          );
          this.emit("shutdown-request", "SIGINT_DURING_PROMPT_UNEXPECTED");
        }
        return;
      }

      if (key && key.ctrl && key.name === "c") {
        this.emit("shutdown-request", "SIGINT_KEYPRESS");
        return; // Main SIGINT handler in index.js will take over
      }

      let actionTaken = false;
      if (key && key.name === "c") {
        await this.promptForSubfolder();
        actionTaken = true;
      } else if (key && key.name === "d") {
        this.emit("set-target-subfolder", null); // Event handled in index.js
        actionTaken = true;
      }

      if (actionTaken) {
        // Per comments in index.js and typical CLI flow, re-display the menu
        // after an action is initiated by a keypress.
        this.displayMenu();
      }
    };

    // Clean up previous listener if any (e.g., nodemon restart)
    // This might remove other listeners if not careful, but _keypressListener should be specific enough.
    const listeners = process.stdin.listeners("keypress");
    if (listeners.includes(this._keypressListener)) {
      // Check if our specific listener is present
      process.stdin.removeListener("keypress", this._keypressListener);
    }
    // Add our new listener
    process.stdin.on("keypress", this._keypressListener);

    this.displayMenu();
    logInfo("ConsoleManager", "Started listening for console commands.");
  }

  async promptForSubfolder() {
    if (this.isPrompting) {
      return;
    }
    this.isPrompting = true;

    const wasRaw = process.stdin.isRaw;
    // Temporarily turn off our keypress handling and raw mode for inquirer
    if (process.stdin.isTTY) {
      process.stdin.removeListener("keypress", this._keypressListener);
      // Inquirer will manage raw mode itself. Some versions prefer it false initially.
      // If wasRaw is true, it means we set it.
      if (wasRaw) {
        try {
          process.stdin.setRawMode(false);
        } catch (e) {
          logError(
            "ConsoleManager",
            "Failed to setRawMode(false) before prompt",
            e
          );
        }
      }
    }

    try {
      console.log(); // Newline for cleaner prompt
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "subfolderName",
          message: "Enter target subfolder name (leave blank for default):",
        },
      ]);

      const newName = answers.subfolderName.trim() || null;
      this.emit("set-target-subfolder", newName);
    } catch (error) {
      // Handle errors from inquirer, including user abort (e.g. Ctrl+C if inquirer throws for it)
      if (error.isTtyError) {
        logError(
          // Using logError as prompt failure is an error condition
          "ConsoleManager",
          "Prompt failed: Not a TTY or TTY error.",
          error // log the error object
        );
      } else {
        logError("ConsoleManager", error, {
          context: "Prompting for subfolder failed (e.g., user aborted)",
        });
        console.error("\nPrompt for subfolder was cancelled or failed.");
      }
    } finally {
      // Restore our keypress listener, raw mode, and resume stdin
      this.isPrompting = false; // Reset flag first

      if (process.stdin.isTTY) {
        // Re-attach our listener *before* setting raw mode or resuming
        process.stdin.on("keypress", this._keypressListener);

        if (wasRaw) {
          // Only restore rawMode if it was raw when we started
          try {
            process.stdin.setRawMode(true);
          } catch (e) {
            logError(
              "ConsoleManager",
              "Failed to setRawMode(true) after prompt",
              e
            );
          }
        }
        // CRITICAL FIX: Resume stdin as inquirer's readline interface likely paused it on close.
        process.stdin.resume();
      }
      // The _keypressListener will call displayMenu after this function resolves.
    }
  }

  displayMenu() {
    console.log("\n---\nImage Processor Controls:");
    console.log("Press 'c' to change target subfolder.");
    console.log("Press 'd' to revert to default target folder.");
    console.log("Press 'Ctrl+C' to exit.");
    console.log("---");
  }

  stop() {
    if (this._keypressListener && process.stdin.isTTY) {
      // Check isTTY before TTY operations
      process.stdin.removeListener("keypress", this._keypressListener);
    }
    this._keypressListener = null; // Clear the reference

    if (process.stdin.isTTY) {
      try {
        // It's crucial to turn raw mode off, otherwise terminal stays messed up.
        process.stdin.setRawMode(false);
      } catch (e) {
        logError("ConsoleManager", "Failed to setRawMode(false) on stop", e);
      }
      // Pausing stdin on stop can also be good practice.
      // process.stdin.pause(); // Uncomment if you want to explicitly pause.
    }
    logInfo("ConsoleManager", "Stopped listening for console commands.");
  }
}

module.exports = ConsoleManager;
