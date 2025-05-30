// src/services/ConsoleManager.js
"use strict";

const chalk = require("chalk");
const readline = require("readline");
const inquirer = require("inquirer");
const { EventEmitter } = require("events");
const { logInfo, logError } = require("./logger");
const InteractiveMenu = require("./InteractiveMenu");

class ConsoleManager extends EventEmitter {
  constructor() {
    super();
    this._keypressListener = null;
    this._isKeypressListenerPaused = false;
    this.mainMenu = null;
    this._originalRawModeState = false; // To store initial raw mode
  }

  pauseKeypressListener() {
    if (this._isKeypressListenerPaused) {
      logInfo("ConsoleManager", "Keypress listener already paused.");
      return;
    }
    if (this._keypressListener && process.stdin.isTTY) {
      try {
        process.stdin.removeListener("keypress", this._keypressListener);
        this._isKeypressListenerPaused = true;
        logInfo("ConsoleManager", "Keypress listener paused.");
      } catch (e) {
        logError(
          "ConsoleManager",
          "Error removing keypress listener during pause",
          e
        );
      }
    } else if (!this._keypressListener) {
      logInfo("ConsoleManager", "Cannot pause: Keypress listener not defined.");
    } else if (!process.stdin.isTTY) {
      logInfo("ConsoleManager", "Cannot pause: Not a TTY.");
    }
  }

  resumeKeypressListener() {
    if (!this._isKeypressListenerPaused) {
      logInfo(
        "ConsoleManager",
        "Keypress listener not paused, no resume action needed, or called unexpectedly."
      );
      // If it's not paused, but we ended up here, ensure hint is shown if TTY
      if (process.stdin.isTTY) this.displayMenuHint();
      return;
    }

    if (this._keypressListener && process.stdin.isTTY) {
      try {
        logInfo(
          "ConsoleManager",
          `Resuming keypress listener. Current stdin.isRaw: ${process.stdin.isRaw}`
        );

        // 1. Ensure Raw Mode is restored to what we set it to initially.
        //    Inquirer should restore it, but we double-check.
        if (process.stdin.isRaw !== this._originalRawModeState) {
          logInfo(
            "ConsoleManager",
            `Raw mode is ${process.stdin.isRaw}, expected ${this._originalRawModeState}. Restoring.`
          );
          try {
            process.stdin.setRawMode(this._originalRawModeState);
          } catch (e) {
            logError(
              "ConsoleManager",
              "Failed to restore original raw mode in resumeKeypressListener",
              e
            );
            // This could be problematic for subsequent keypresses.
          }
        }

        // 2. Ensure stdin is resumed.
        //    readline/inquirer might pause it.
        if (typeof process.stdin.resume === "function") {
          process.stdin.resume();
          logInfo("ConsoleManager", "Called process.stdin.resume()");
        }

        // 3. Re-attach the listener.
        //    First, defensively remove it in case it's somehow still there to prevent duplicates.
        process.stdin.removeListener("keypress", this._keypressListener);
        process.stdin.on("keypress", this._keypressListener);

        this._isKeypressListenerPaused = false;
        logInfo("ConsoleManager", "Keypress listener resumed and re-attached.");
        this.displayMenuHint(); // Show hint now that we're back in control
      } catch (e) {
        logError("ConsoleManager", "Error during resumeKeypressListener", e);
        // If this fails, console interaction is likely broken.
      }
    } else if (!this._keypressListener) {
      logInfo(
        "ConsoleManager",
        "Cannot resume: Keypress listener not defined."
      );
    } else if (!process.stdin.isTTY) {
      logInfo("ConsoleManager", "Cannot resume: Not a TTY.");
    }
  }

  start() {
    if (!process.stdin.isTTY) {
      logInfo("ConsoleManager", "Not a TTY. Console commands disabled.");
      return;
    }

    readline.emitKeypressEvents(process.stdin);

    try {
      // Store the intended raw mode state
      this._originalRawModeState = true;
      process.stdin.setRawMode(this._originalRawModeState);
      logInfo(
        "ConsoleManager",
        `Set raw mode to ${this._originalRawModeState}`
      );
    } catch (e) {
      logError("ConsoleManager", "Failed to set raw mode on stdin.", e);
      return;
    }

    if (typeof process.stdin.resume === "function") {
      process.stdin.resume(); // Ensure stdin is flowing
    }

    this._keypressListener = async (str, key) => {
      if (this._isKeypressListenerPaused) {
        // logInfo("ConsoleManager DEBUG", "Keypress ignored (listener paused).");
        return;
      }

      if (key && key.ctrl && key.name === "c") {
        logInfo("ConsoleManager", "Ctrl+C detected by primary listener.");
        this.emit("shutdown-request", "SIGINT_KEYPRESS");
        return;
      }

      if (key && (key.ctrl || key.meta)) {
        // logInfo("ConsoleManager DEBUG", `Ignoring Ctrl/Meta key: ${key.name}`);
        return;
      }

      if (this.mainMenu && key && (key.name || str)) {
        logInfo(
          "ConsoleManager",
          `Keypress detected ('${str}', name: ${
            key ? key.name : "N/A"
          }), opening menu.`
        );
        await this.mainMenu.open();
      } else if (!this.mainMenu) {
        logError(
          "ConsoleManager",
          "Keypress received but mainMenu is not initialized."
        );
      }
    };

    // Ensure no old listeners of this type if start is somehow called multiple times
    // or defensively clean up before attaching.
    process.stdin.removeAllListeners("keypress"); // Be a bit more aggressive here
    process.stdin.on("keypress", this._keypressListener);

    this.initializeMenu();

    this.displayMenuHint();
    logInfo(
      "ConsoleManager",
      "Started. Press any key for menu, or Ctrl+C to exit."
    );
  }

  displayMenuHint() {
    if (!this._isKeypressListenerPaused && process.stdin.isTTY) {
      // Only show hint if we are actively listening
      console.log(chalk.gray("\n(Press any key for menu, or Ctrl+C to exit)"));
    }
  }

  initializeMenu() {
    const menuItems = [
      {
        id: "change_target",
        displayName: `${chalk.yellowBright("C")}hange Target Subfolder`,
        action: async () => {
          await this.promptForSubfolderInternal();
        },
      },
      {
        id: "default_target",
        displayName: `${chalk.yellowBright("S")}et Target to Default`,
        action: async () => {
          this.emit("set-target-subfolder", null);
        },
      },
      {
        id: "show_status",
        displayName: `${chalk.yellowBright("V")}iew Current Status`,
        action: async () => {
          console.log();
          this.emit("request-status-display");
        },
      },
      {
        id: "exit_app",
        displayName: chalk.redBright("Exit Application"),
        action: async () => {
          this.emit("shutdown-request", "MENU_EXIT_ACTION");
        },
      },
    ];

    this.mainMenu = new InteractiveMenu(
      "Image Processor Controls:",
      menuItems,
      {
        pauseKeypressListener: this.pauseKeypressListener.bind(this),
        resumeKeypressListener: this.resumeKeypressListener.bind(this),
      }
    );

    this.mainMenu.on("menuClosed", () => {
      logInfo("ConsoleManager", "Main menu interaction concluded.");
    });

    this.mainMenu.on("actionExecuted", (actionId) => {
      logInfo("ConsoleManager", `Menu action '${actionId}' was executed.`);
    });
  }
  async promptForSubfolderInternal() {
    // This method uses inquirer directly.
    // `pauseKeypressListener` will have been called by `InteractiveMenu` before this action starts.
    // Inquirer will manage its own TTY/raw mode state changes during the prompt.
    // `resumeKeypressListener` will be called by `InteractiveMenu` after this action (and inquirer) completes.

    // Store current raw state if needed, though inquirer should handle it
    const wasRaw = process.stdin.isRaw;
    if (wasRaw) {
      try {
        // Inquirer input prompts usually work better with raw mode false
        // process.stdin.setRawMode(false);
        // However, modern Inquirer might handle this fine. Let's trust Inquirer first.
      } catch (e) {
        logError("ConsoleManager", "Error setting raw false for prompt", e);
      }
    }

    try {
      console.log();
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "subfolderName",
          message: chalk.yellow(
            "Enter target subfolder name (leave blank for default):"
          ),
        },
      ]);
      const newName = answers.subfolderName.trim() || null;
      this.emit("set-target-subfolder", newName);
    } catch (error) {
      if (error.isTtyError) {
        logError(
          "ConsoleManager",
          "Subfolder prompt failed: TTY error.",
          error
        );
        console.error(chalk.red("\nPrompt failed due to TTY issue."));
      } else {
        logError(
          "ConsoleManager",
          "Prompt for subfolder was cancelled or failed.",
          error
        );
        console.error(
          chalk.red("\nPrompt for subfolder was cancelled or failed.")
        );
      }
    } finally {
      // Inquirer should restore raw mode. If we manually changed it, restore it here.
      // if (wasRaw && !process.stdin.isRaw) {
      //    try { process.stdin.setRawMode(true); }
      //    catch(e) { logError("ConsoleManager", "Error restoring raw true after prompt", e); }
      // }
      // The main `resumeKeypressListener` called by InteractiveMenu's finally block will handle
      // ensuring the global listener is back up with correct stdin state.
    }
  }

  stop() {
    if (this._keypressListener && process.stdin.isTTY) {
      process.stdin.removeListener("keypress", this._keypressListener);
      logInfo("ConsoleManager", "Keypress listener removed on stop.");
    }
    this._keypressListener = null;
    this._isKeypressListenerPaused = false;

    if (process.stdin.isTTY) {
      try {
        // Attempt to restore terminal to a non-raw state if it was set raw
        if (
          process.stdin.isRaw &&
          typeof process.stdin.setRawMode === "function"
        ) {
          process.stdin.setRawMode(false);
          logInfo("ConsoleManager", "Set raw mode to false on stop.");
        }
      } catch (e) {
        logError("ConsoleManager", "Failed to setRawMode(false) on stop", e);
      }
      // Resume stdin flow in case it was paused
      if (typeof process.stdin.resume === "function") {
        process.stdin.resume();
      }
    }
    logInfo("ConsoleManager", "Stopped listening for console commands.");
  }
}

module.exports = ConsoleManager;
