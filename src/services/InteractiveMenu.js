// src/services/InteractiveMenu.js
"use strict";

const inquirer = require("inquirer");
const chalk = require("chalk");
const { EventEmitter } = require("events");
const { logInfo, logError } = require("./logger"); // Assuming logger is in the same directory

class InteractiveMenu extends EventEmitter {
  /**
   * @param {string} menuTitle The title displayed above the menu.
   * @param {Array<Object>} items Array of menu item definitions.
   *        Each item: { id: string, displayName: string, action: Function, isVisible?: () => boolean, shortName?: string }
   * @param {Object} consoleControl Object with methods to pause/resume the console's main keypress listener.
   *        { pauseKeypressListener: Function, resumeKeypressListener: Function }
   */
  constructor(menuTitle, items, consoleControl) {
    super();
    this.menuTitle = menuTitle;
    this.items = items;
    this.pauseConsoleListener = consoleControl.pauseKeypressListener;
    this.resumeConsoleListener = consoleControl.resumeKeypressListener;
    this.isMenuOpen = false;
  }

  async open() {
    if (this.isMenuOpen) {
      logInfo("InteractiveMenu", "Menu open attempted while already open.");
      return;
    }
    this.isMenuOpen = true;
    this.pauseConsoleListener(); // Pause ConsoleManager's global keypress listener

    try {
      const visibleItems = this.items.filter(
        (item) =>
          !item.isVisible ||
          (typeof item.isVisible === "function" && item.isVisible())
      );

      if (visibleItems.length === 0) {
        console.log(chalk.yellow("\nNo menu items currently available."));
        this.emit("menuUnavailable");
        return; // Exits open(), finally will run
      }

      const choices = visibleItems.map((item) => ({
        name: item.displayName, // This string can be pre-styled with chalk for custom item appearance
        value: item.id, // Value returned by inquirer
        short:
          item.shortName || item.displayName.replace(/\u001b\[[0-9;]*m/g, ""), // For display after selection (strips chalk codes)
      }));

      // Add a standard "Cancel" option
      choices.push(new inquirer.Separator());
      choices.push({ name: "Cancel", value: "__CANCEL__" });

      console.log(); // Add a blank line for better visual separation before the menu

      const { selection } = await inquirer.prompt([
        {
          type: "list",
          name: "selection",
          message: chalk.bold.cyanBright(this.menuTitle),
          choices: choices,
          pageSize: Math.min(choices.length, 12), // Show up to 12 items, or fewer if less items
          loop: false, // Don't loop from top to bottom
          // Inquirer handles highlighting of the selected item automatically
        },
      ]);

      if (selection === "__CANCEL__") {
        logInfo("InteractiveMenu", "Menu selection cancelled by user.");
        this.emit("menuCanceled");
        return; // Exits open(), finally will run
      }

      const selectedItem = visibleItems.find((item) => item.id === selection);
      if (selectedItem && selectedItem.action) {
        logInfo(
          "InteractiveMenu",
          `Executing action for menu item: ${selectedItem.id}`
        );
        await selectedItem.action(); // Execute the associated action
        this.emit("actionExecuted", selectedItem.id);
      }
    } catch (error) {
      // Handle errors from inquirer (e.g., TTY issues, or user pressing Ctrl+C during prompt)
      if (error.isTtyError) {
        logError("InteractiveMenu", "Menu display failed: TTY error.", error);
        console.error(
          chalk.red("\nMenu display failed: Not a TTY or TTY error.")
        );
      } else {
        // This often means user pressed Ctrl+C during the Inquirer prompt, which rejects the promise
        logInfo(
          "InteractiveMenu",
          "Menu interaction was cancelled or failed.",
          error.message
        );
        console.log(chalk.yellow("\nMenu interaction cancelled.")); // User-friendly message
      }
      this.emit("menuError", error);
    } finally {
      this.isMenuOpen = false;
      this.resumeConsoleListener(); // Always resume ConsoleManager's listener
      this.emit("menuClosed"); // Notify that the menu interaction has finished
    }
  }
}

module.exports = InteractiveMenu;
