#!/usr/bin/env node
/**
 * tmux-ai — Auto-configure tmux for managing multiple AI CLIs
 * Supports: macOS (Homebrew) & Linux (apt/yum/pacman)
 */

import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
} from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import * as readline from "readline";

// ─── Constants ─────────────────────────────────────────────
const HOME = homedir();
const TMUX_CONF = join(HOME, ".tmux.conf");
const TPM_DIR = join(HOME, ".tmux/plugins/tpm");
const LOCAL_BIN = join(HOME, ".local/bin");

// ─── Colors (ANSI) ─────────────────────────────────────────
const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const info = (msg: string) => console.log(`${colors.cyan("[info]")}  ${msg}`);
const success = (msg: string) =>
  console.log(`${colors.green("[ok]")}    ${msg}`);
const warn = (msg: string) => console.log(`${colors.yellow("[warn]")}  ${msg}`);
const error = (msg: string) => {
  console.error(`${colors.red("[error]")} ${msg}`);
  process.exit(1);
};

// ─── Utilities ─────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function execLive(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

// ─── Ensure Homebrew PATH in shell RC (macOS) ──────────────
// tmux starts non-login shells that skip .zprofile, so
// brew-installed commands (nvim, lazygit, etc.) won't be found
// unless brew shellenv is in .zshrc.
function ensureBrewShellenv(os: "macos" | "linux"): void {
  if (os !== "macos") return;

  const brewBin = "/opt/homebrew/bin/brew";
  if (!existsSync(brewBin)) return; // Intel Mac or no Homebrew

  const zshrc = join(HOME, ".zshrc");
  if (!existsSync(zshrc)) return;

  const content = readFileSync(zshrc, "utf-8");
  if (content.includes("brew shellenv")) {
    success("Homebrew shellenv already configured in .zshrc");
    return;
  }

  // Prepend to .zshrc so it's available before everything else
  const brewLine = `# Added by tmux-ai — ensures Homebrew PATH in tmux sessions\neval "$(/opt/homebrew/bin/brew shellenv)"\n\n`;
  writeFileSync(zshrc, brewLine + content, "utf-8");
  success("Added Homebrew shellenv to .zshrc (fixes PATH in tmux)");
}

// ─── Detect OS ─────────────────────────────────────────────
function detectOS(): "macos" | "linux" {
  const os = platform();
  if (os === "darwin") return "macos";
  if (os === "linux") return "linux";
  error(`Unsupported OS: ${os}`);
  return "linux"; // unreachable
}

// ─── Check tmux version ────────────────────────────────────
function checkTmuxVersion(): boolean {
  if (!commandExists("tmux")) {
    return false;
  }

  const versionStr = exec("tmux -V");
  const match = versionStr.match(/[\d.]+/);
  if (!match) return false;

  const [major, minor] = match[0].split(".").map(Number);

  // Popup requires tmux 3.2+
  if (major < 3 || (major === 3 && minor < 2)) {
    warn(`tmux ${match[0]} detected. Popup features require tmux 3.2+`);
    warn("Consider upgrading: brew install tmux (macOS)");
    return false;
  }

  success(`tmux ${match[0]} supports popup windows`);
  return true;
}

// ─── Install tmux ──────────────────────────────────────────
function installTmux(os: "macos" | "linux"): void {
  if (commandExists("tmux")) {
    const version = exec("tmux -V");
    success(`tmux already installed: ${version}`);
    return;
  }

  info("Installing tmux...");

  if (os === "macos") {
    if (!commandExists("brew")) {
      error("Homebrew not found. Install it first: https://brew.sh");
    }
    execLive("brew install tmux");
  } else {
    // Linux
    if (commandExists("apt-get")) {
      execLive("sudo apt-get update -qq && sudo apt-get install -y tmux");
    } else if (commandExists("yum")) {
      execLive("sudo yum install -y tmux");
    } else if (commandExists("pacman")) {
      execLive("sudo pacman -Sy --noconfirm tmux");
    } else if (commandExists("apk")) {
      execLive("sudo apk add tmux");
    } else {
      error("No supported package manager found (apt/yum/pacman/apk)");
    }
  }

  const version = exec("tmux -V");
  success(`tmux installed: ${version}`);
}

// ─── Install TPM ───────────────────────────────────────────
function installTPM(): void {
  if (existsSync(TPM_DIR)) {
    success("TPM already installed");
    return;
  }

  info("Installing TPM (Tmux Plugin Manager)...");
  execLive(`git clone https://github.com/tmux-plugins/tpm "${TPM_DIR}"`);
  success(`TPM installed at ${TPM_DIR}`);
}

// ─── Check optional dependencies ───────────────────────────
async function checkOptionalDeps(os: "macos" | "linux"): Promise<{
  missingCritical: string[];
  missingOptional: string[];
}> {
  const missingCritical: string[] = [];
  const missingOptional: string[] = [];

  // fzf is critical for tmux-fzf
  if (!commandExists("fzf")) {
    missingCritical.push("fzf");
  }

  // Optional but recommended
  if (!commandExists("nvim")) missingOptional.push("neovim");
  if (!commandExists("lazygit")) missingOptional.push("lazygit");
  if (!commandExists("bat")) missingOptional.push("bat");
  if (!commandExists("htop")) missingOptional.push("htop");

  if (missingOptional.length > 0) {
    warn(`Optional dependencies not found: ${missingOptional.join(", ")}`);
    warn("Some popup features (Prefix+g/f/m) may not work.");
    if (os === "macos") {
      const shouldInstall = await askYesNo(
        `Install optional dependencies (${missingOptional.join(", ")}) now?`
      );
      if (shouldInstall) {
        execLive(`brew install ${missingOptional.join(" ")}`);
        success("Optional dependencies installed");
        missingOptional.length = 0;
      }
    } else {
      warn(`Install with your package manager: ${missingOptional.join(" ")}`);
    }
  }

  if (missingCritical.length > 0) {
    warn("⚠️  fzf not found - tmux-fzf plugin (Prefix+F) won't work!");
    if (os === "macos") {
      const shouldInstall = await askYesNo("Install fzf now?");
      if (shouldInstall) {
        execLive("brew install fzf");
        success("fzf installed");
        missingCritical.length = 0;
      }
    }
  }

  return { missingCritical, missingOptional };
}

// ─── Setup Neovim config ───────────────────────────────────
async function setupNeovim(): Promise<void> {
  if (!commandExists("nvim")) {
    return;
  }

  const nvimConfigDir = join(HOME, ".config/nvim");
  const nvimInitLua = join(nvimConfigDir, "init.lua");

  if (existsSync(nvimInitLua)) {
    info("Neovim config already exists, skipping setup");
    return;
  }

  const shouldSetup = await askYesNo(
    "Neovim detected. Set up plugins (treesitter, LSP for Go/TypeScript)?"
  );
  if (!shouldSetup) {
    return;
  }

  if (!existsSync(nvimConfigDir)) {
    mkdirSync(nvimConfigDir, { recursive: true });
  }

  const initLua = `-- ============================================================
-- tmux-ai neovim config
-- Plugins: lazy.nvim, treesitter, LSP (Go, TypeScript)
-- ============================================================

-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git", "clone", "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- Basic settings
vim.g.mapleader = " "
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.expandtab = true
vim.opt.signcolumn = "yes"
vim.opt.termguicolors = true

-- Plugins
require("lazy").setup({
  -- Syntax highlighting via treesitter
  {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    opts = {
      ensure_installed = {
        "go", "typescript", "tsx", "javascript",
        "lua", "vim", "vimdoc", "json", "yaml",
        "html", "css", "bash", "markdown", "markdown_inline",
      },
      highlight = { enable = true },
      indent = { enable = true },
    },
  },

  -- LSP: mason for auto-installing servers + lspconfig
  {
    "williamboman/mason.nvim",
    config = function()
      require("mason").setup()
    end,
  },
  {
    "williamboman/mason-lspconfig.nvim",
    dependencies = { "williamboman/mason.nvim", "neovim/nvim-lspconfig" },
    config = function()
      require("mason-lspconfig").setup({
        ensure_installed = { "gopls", "ts_ls" },
        handlers = {
          function(server_name)
            require("lspconfig")[server_name].setup({})
          end,
        },
      })
    end,
  },

  -- Autocompletion
  {
    "hrsh7th/nvim-cmp",
    dependencies = {
      "hrsh7th/cmp-nvim-lsp",
      "hrsh7th/cmp-buffer",
      "hrsh7th/cmp-path",
    },
    config = function()
      local cmp = require("cmp")
      cmp.setup({
        sources = cmp.config.sources({
          { name = "nvim_lsp" },
          { name = "buffer" },
          { name = "path" },
        }),
        mapping = cmp.mapping.preset.insert({
          ["<C-Space>"] = cmp.mapping.complete(),
          ["<CR>"] = cmp.mapping.confirm({ select = true }),
          ["<C-n>"] = cmp.mapping.select_next_item(),
          ["<C-p>"] = cmp.mapping.select_prev_item(),
        }),
      })
    end,
  },
})

-- LSP keybindings (set on attach)
vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(args)
    local opts = { buffer = args.buf }
    vim.keymap.set("n", "gd", vim.lsp.buf.definition, opts)
    vim.keymap.set("n", "gr", vim.lsp.buf.references, opts)
    vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)
    vim.keymap.set("n", "<leader>rn", vim.lsp.buf.rename, opts)
    vim.keymap.set("n", "<leader>ca", vim.lsp.buf.code_action, opts)
    vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, opts)
    vim.keymap.set("n", "]d", vim.diagnostic.goto_next, opts)
  end,
})
`;

  writeFileSync(nvimInitLua, initLua, "utf-8");
  success(`Neovim config written to ${nvimInitLua}`);

  // Run nvim headless to bootstrap lazy.nvim and install plugins
  info("Installing Neovim plugins (this may take a moment)...");
  const result = execLive(
    'nvim --headless "+Lazy! sync" +qa 2>&1'
  );
  if (result) {
    success("Neovim plugins installed (treesitter, LSP for Go & TypeScript)");
  } else {
    warn("Neovim plugin install may not have completed. Open nvim to finish setup.");
  }
}

// ─── Ask yes/no ────────────────────────────────────────────
function askYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// ─── Backup existing config ────────────────────────────────
function backupConfig(): void {
  if (existsSync(TMUX_CONF)) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "")
      .slice(0, 15);
    const backup = `${TMUX_CONF}.bak.${timestamp}`;
    copyFileSync(TMUX_CONF, backup);
    warn(`Existing config backed up to ${backup}`);
  }
}

// ─── List backup files ─────────────────────────────────────
function listBackups(): string[] {
  const dir = HOME;
  const prefix = ".tmux.conf.bak.";
  try {
    return readdirSync(dir)
      .filter((f) => f.startsWith(prefix))
      .map((f) => join(dir, f))
      .sort((a, b) => {
        // Sort by mtime descending (newest first)
        return statSync(b).mtimeMs - statSync(a).mtimeMs;
      });
  } catch {
    return [];
  }
}

// ─── Ask user to pick a backup ────────────────────────────
function askChoice(question: string, options: string[]): Promise<number> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(`\n${question}`);
    options.forEach((opt, i) => {
      console.log(`  ${colors.bold(String(i + 1))}. ${opt}`);
    });
    console.log(`  ${colors.bold("0")}. Cancel`);

    rl.question("\nEnter number: ", (answer) => {
      rl.close();
      const n = parseInt(answer, 10);
      if (isNaN(n) || n < 0 || n > options.length) {
        resolve(-1);
      } else {
        resolve(n - 1); // -1 means cancel (0 input)
      }
    });
  });
}

// ─── Restore backup config ────────────────────────────────
async function restoreConfig(): Promise<void> {
  const backups = listBackups();

  if (backups.length === 0) {
    warn("No backup files found (looked for ~/.tmux.conf.bak.*)");
    return;
  }

  info(`Found ${backups.length} backup(s):`);

  const labels = backups.map((f) => {
    const name = f.split("/").pop()!;
    const mtime = statSync(f).mtime.toLocaleString();
    return `${name}  ${colors.yellow(`(${mtime})`)}`;
  });

  const choice = await askChoice("Which backup would you like to restore?", labels);

  if (choice === -1) {
    info("Restore cancelled.");
    return;
  }

  const selected = backups[choice];

  // Back up current config before overwriting
  if (existsSync(TMUX_CONF)) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "")
      .slice(0, 15);
    const safeguard = `${TMUX_CONF}.bak.${timestamp}`;
    copyFileSync(TMUX_CONF, safeguard);
    warn(`Current config backed up to ${safeguard}`);
  }

  copyFileSync(selected, TMUX_CONF);
  success(`Restored ${selected.split("/").pop()} → ${TMUX_CONF}`);
}

// ─── Write tmux.conf ───────────────────────────────────────
function writeConfig(): void {
  info(`Writing ${TMUX_CONF} ...`);

  const config = generateTmuxConfig();
  writeFileSync(TMUX_CONF, config, "utf-8");

  success("tmux.conf written");
}

function generateTmuxConfig(): string {
  const date = new Date().toISOString();

  return `# ============================================================
# tmux-ai — Optimized for managing multiple AI CLIs
# Generated by tmux-ai on ${date}
# ============================================================

# ── Prefix: Ctrl-a (easier than Ctrl-b) ─────────────────────
unbind C-b
set-option -g prefix C-a
bind-key C-a send-prefix

# ── General ─────────────────────────────────────────────────
set -g default-terminal "screen-256color"
set -ag terminal-overrides ",xterm-256color:RGB"
set -g history-limit 50000
set -g display-time 2000
set -g status-interval 5
set -g focus-events on
set -sg escape-time 0          # No delay for ESC (important for Vim/AI CLIs)
set -g mouse on                # Mouse support

# ── Extended keys (CSI u encoding) ───────────────────────────
# Required for AI CLIs (Claude Code, etc.) to receive Shift+Enter
# as a distinct key from Enter. Without this, tmux intercepts the
# CSI u sequence and converts it to a plain Enter.
set -s extended-keys on
set -as terminal-features 'xterm*:extkeys'

# ── Index windows/panes from 1 ──────────────────────────────
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on

# ── Split panes with | and - (intuitive) ────────────────────
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
unbind '"'
unbind %

# ── New window in current path ──────────────────────────────
bind c new-window -c "#{pane_current_path}"

# ── Pane navigation: Vim-style ──────────────────────────────
bind h select-pane -L
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R

# ── Pane resize ─────────────────────────────────────────────
bind -r H resize-pane -L 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5
bind -r L resize-pane -R 5

# ── Quick window switching ───────────────────────────────────
bind -r Tab next-window
bind -r BTab previous-window   # Shift+Tab → previous window

# ── Reload config ───────────────────────────────────────────
bind r source-file ~/.tmux.conf \\; display "✓ Config reloaded"

# ── Copy mode: Vi keys ──────────────────────────────────────
setw -g mode-keys vi
bind Enter copy-mode
bind -T copy-mode-vi v send -X begin-selection
bind -T copy-mode-vi y send -X copy-selection-and-cancel
bind -T copy-mode-vi Escape send -X cancel

# ── AI Session layout ───────────────────────────────────────
# Prefix + A  →  create a new AI workspace window
bind A new-window -n "ai" \\; split-window -h -p 40 \\; select-pane -t 1

# ── Named AI windows shortcuts ──────────────────────────────
bind C new-window -n "claude" -c "#{pane_current_path}"
bind G new-window -n "gpt" -c "#{pane_current_path}"

# ── Window/Pane naming ─────────────────────────────────────
# Prefix + , → rename window and disable automatic-rename to keep it
bind , command-prompt -p "Window name:" "rename-window '%%' \\; setw automatic-rename off"
bind P command-prompt -p "Pane name:" "select-pane -T '%%'"

# ── tmux-fzf config ─────────────────────────────────────────
set -g @fzf-url-fzf-options '-p 60%,30% --prompt="   " --border-label=" Open URL "'
set -g @fzf-url-history-limit '2000'
set-environment -g TMUX_FZF_LAUNCH_KEY "F"
set-environment -g TMUX_FZF_ORDER "window|pane|command|keybinding"
set-environment -g TMUX_FZF_OPTIONS "-p -w 62% -h 38% --bind='ctrl-p:execute-silent(echo -n {} | (command -v pbcopy >/dev/null && pbcopy || xclip -selection clipboard 2>/dev/null || xsel --clipboard 2>/dev/null))+abort'"

# ── tmux-sessionx config ─────────────────────────────────────
set -g @sessionx-bind 'S'
set -g @sessionx-x-path '~'
set -g @sessionx-window-height '75%'
set -g @sessionx-window-width '75%'
set -g @sessionx-preview-enabled 'true'
set -g @sessionx-preview-location 'right'
set -g @sessionx-preview-ratio '60%'
set -g @sessionx-filter-current 'false'
set -g @sessionx-prompt ' '

# ── Status bar (catppuccin/tmux v2) ──────────────────────────
set -g status-position top
set -g @catppuccin_flavor 'mocha'
set -g @catppuccin_window_status_style "rounded"

# Window text: force immediate evaluation with #W (window name)
# Use automatic-rename to ensure window name updates properly
set -g automatic-rename on
set -g automatic-rename-format "#{b:pane_current_path}"
set -g @catppuccin_window_text " #W"
set -g @catppuccin_window_current_text " #W#{?window_zoomed_flag, 🔍,}"

# Load catppuccin (must be before status-right)
run ~/.tmux/plugins/tmux/catppuccin.tmux

# Status line modules (using catppuccin built-in modules for consistent style)
set -g status-right-length 100
set -g status-left ""
set -g @catppuccin_directory_text " #(~/.local/bin/tmux-truncate-path)"
set -g status-right "#{E:@catppuccin_status_directory}"
set -ag status-right "#{E:@catppuccin_status_session}"
set -ag status-right "#{E:@catppuccin_status_date_time}"

# ── Popup 浮动窗口 (tmux 3.2+) ──────────────────────────────
bind g display-popup -E -w 90% -h 90% "command -v lazygit >/dev/null && lazygit || { echo 'lazygit not installed. Run: brew install lazygit'; read; }"
bind f display-popup -E -w 80% -h 80% "if command -v fzf >/dev/null; then fzf --preview 'command -v bat >/dev/null && bat --color=always --style=numbers {} || cat {}' --bind='ctrl-p:execute-silent(echo -n {} | (command -v pbcopy >/dev/null && pbcopy || xclip -selection clipboard 2>/dev/null || xsel --clipboard 2>/dev/null))+abort' --bind='ctrl-o:execute(command -v nvim >/dev/null && nvim {} || vim {})'; else echo 'fzf not installed. Run: brew install fzf'; read; fi"
bind m display-popup -E -w 80% -h 80% "command -v htop >/dev/null && htop || top"
bind \\\\ display-popup -E -w 80% -h 80% "$SHELL"

# ── Pane border ─────────────────────────────────────────────
# (catppuccin handles pane border styling now)

# ── Plugins (TPM) ───────────────────────────────────────────
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'
set -g @plugin 'tmux-plugins/tmux-yank'
set -g @plugin 'tmux-plugins/tmux-open'
set -g @plugin 'sainnhe/tmux-fzf'
set -g @plugin 'omerxx/tmux-sessionx'
set -g @plugin 'catppuccin/tmux'

# tmux-continuum: auto-save every 15 min, auto-restore on start
set -g @continuum-restore 'on'
set -g @continuum-save-interval '15'

# tmux-resurrect: also save pane contents
set -g @resurrect-capture-pane-contents 'on'

# Initialize TPM (keep this at the very bottom)
run '~/.tmux/plugins/tpm/tpm'
`;
}

// ─── Write path truncate script ────────────────────────────
function writeTruncateScript(): void {
  const scriptPath = join(LOCAL_BIN, "tmux-truncate-path");

  if (!existsSync(LOCAL_BIN)) {
    mkdirSync(LOCAL_BIN, { recursive: true });
  }

  // Script to truncate path keeping head and tail segments
  // Example: ~/dev/some/very/deep/nested/path/to/project → ~/dev/.../to/project
  const script = `#!/usr/bin/env bash
# tmux-truncate-path: Truncate path keeping first 2 and last 2 segments
# Usage: tmux-truncate-path [path]
# If path not provided, uses current pane's path

PATH_INPUT="\${1:-\$(tmux display-message -p '#{pane_current_path}')}"

# Replace $HOME with ~
PATH_INPUT="\${PATH_INPUT/#$HOME/~}"

# Split path into array by /
IFS='/' read -ra PARTS <<< "$PATH_INPUT"
COUNT=\${#PARTS[@]}

# If 5 or fewer segments, no need to truncate (head 2 + tail 2 + possible empty = 5)
if [ "$COUNT" -le 5 ]; then
  echo "$PATH_INPUT"
  exit 0
fi

# Keep first 2 and last 2 segments
# PARTS[0] is empty if path starts with / or ~
HEAD="\${PARTS[0]}/\${PARTS[1]}/\${PARTS[2]}"
TAIL="\${PARTS[$COUNT-2]}/\${PARTS[$COUNT-1]}"

echo "\${HEAD}/.../\${TAIL}"
`;

  writeFileSync(scriptPath, script, "utf-8");
  chmodSync(scriptPath, 0o755);
  success(`Path truncate script written to ${scriptPath}`);
}

// ─── Write AI session launcher script ──────────────────────
function writeSessionScript(): void {
  const scriptPath = join(LOCAL_BIN, "tai");

  if (!existsSync(LOCAL_BIN)) {
    mkdirSync(LOCAL_BIN, { recursive: true });
  }

  const script = `#!/usr/bin/env bash
# tai: Launch a pre-configured AI workspace session
# Usage: tai [--windows win1,win2,...] [--session NAME]
#
# Options:
#   --windows   Comma-separated list of windows to create
#               (default: current directory name)
#   --session   Session name (default: current directory name)
#
# Examples:
#   tai                          # 1 window, named after current dir
#   tai --windows main,claude    # main + claude
#   tai --windows main,claude,gpt,monitor  # all windows

DIR_NAME="\$(basename "\$(pwd)")"
SESSION="\$DIR_NAME"
WINDOWS="\$DIR_NAME"

while [[ \$# -gt 0 ]]; do
  case "\$1" in
    --windows) WINDOWS="\$2"; shift 2 ;;
    --session) SESSION="\$2"; shift 2 ;;
    *) echo "Unknown option: \$1"; exit 1 ;;
  esac
done

if tmux has-session -t "\$SESSION" 2>/dev/null; then
  echo "Session '\$SESSION' already exists. Attaching..."
  tmux attach-session -t "\$SESSION"
  exit 0
fi

IFS=',' read -ra WIN_LIST <<< "\$WINDOWS"
FIRST="\${WIN_LIST[0]}"

# Create session with first window
tmux new-session -d -s "\$SESSION" -n "\$FIRST"

# Set up each window
setup_window() {
  local name="\$1"
  case "\$name" in
    main)
      tmux send-keys -t "\$SESSION:\$name" "echo '🤖 AI Workspace ready'" Enter
      ;;
    claude)
      tmux send-keys -t "\$SESSION:\$name" "# claude / anthropic cli here" Enter
      ;;
    gpt)
      tmux send-keys -t "\$SESSION:\$name" "# openai / other ai cli here" Enter
      ;;
    monitor)
      tmux split-window -h -t "\$SESSION:\$name"
      if command -v htop &>/dev/null; then
        tmux send-keys -t "\$SESSION:\$name.1" "htop" Enter
      else
        tmux send-keys -t "\$SESSION:\$name.1" "# htop not installed" Enter
      fi
      tmux send-keys -t "\$SESSION:\$name.2" "# notes / logs" Enter
      ;;
    *)
      tmux send-keys -t "\$SESSION:\$name" "# \$name" Enter
      ;;
  esac
}

# Setup first window
setup_window "\$FIRST"

# Create and setup remaining windows
for ((i=1; i<\${#WIN_LIST[@]}; i++)); do
  name="\${WIN_LIST[\$i]}"
  tmux new-window -t "\$SESSION" -n "\$name"
  setup_window "\$name"
done

tmux select-window -t "\$SESSION:\$FIRST"
tmux attach-session -t "\$SESSION"
`;

  writeFileSync(scriptPath, script, "utf-8");
  chmodSync(scriptPath, 0o755);
  success(`AI session launcher written to ${scriptPath}`);

  // Add to PATH hint
  const shellRc = existsSync(join(HOME, ".zshrc"))
    ? join(HOME, ".zshrc")
    : join(HOME, ".bashrc");

  if (existsSync(shellRc)) {
    const rcContent = readFileSync(shellRc, "utf-8");
    if (!rcContent.includes(".local/bin")) {
      writeFileSync(
        shellRc,
        `${rcContent}\n# Added by tmux-ai\nexport PATH="$HOME/.local/bin:$PATH"\n`,
        "utf-8"
      );
      success(`Added ~/.local/bin to PATH in ${shellRc}`);
      warn("Run 'source " + shellRc + "' to use 'tai' command");
    }
  }
}

// ─── Install TPM plugins ───────────────────────────────────
async function installPlugins(): Promise<void> {
  info("Installing TPM plugins...");

  // Check for active sessions
  const sessions = exec("tmux list-sessions 2>/dev/null");
  if (sessions && !sessions.includes("__tmp")) {
    warn("Active tmux sessions detected. Skipping auto-install.");
    warn("Press Prefix + I inside tmux to install plugins.");
    return;
  }

  exec("tmux kill-server 2>/dev/null");
  await sleep(500);

  try {
    exec("tmux new-session -d -s __tmp_install");
    await sleep(2000);

    const installScript = join(TPM_DIR, "bin/install_plugins");
    if (existsSync(installScript)) {
      execLive(installScript);
      success("TPM plugins installed");
    }

    exec("tmux kill-session -t __tmp_install 2>/dev/null");
  } catch {
    warn("Could not auto-install plugins. Press Prefix + I inside tmux.");
  }
}

// ─── Print cheatsheet ──────────────────────────────────────
function printCheatsheet(): void {
  const { cyan, bold } = colors;

  console.log(`
${bold(cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"))}
${bold("  tmux-ai  Quick Reference")}
${cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}
  Prefix key : ${bold("Ctrl-a")}

  ${bold("Sessions")}
    tai                launch session named after current dir
    tai --windows main,claude,gpt,monitor
                     launch with specified windows
    Prefix + d       detach from session
    tmux ls          list sessions
    tmux a -t NAME   attach session

  ${bold("Windows")}
    Prefix + c       new window (current path)
    Prefix + C       new window: claude
    Prefix + G       new window: gpt
    Prefix + A       AI split layout
    Prefix + Tab     next window
    Prefix + 1~9     jump to window

  ${bold("Panes")}
    Prefix + |       split horizontal
    Prefix + -       split vertical
    Prefix + h/j/k/l navigate panes
    Prefix + z       zoom/unzoom pane

  ${bold("Popup 浮动窗口")}
    Prefix + g       lazygit
    Prefix + f       fzf file search
    Prefix + m       htop / top
    Prefix + \\       floating shell

  ${bold("Fuzzy Search")}
    Prefix + S       session manager (sessionx)
    Prefix + F       fuzzy search (tmux-fzf)

  ${bold("Plugins")}
    Prefix + I       install plugins
    Prefix + Ctrl-s  save session
    Prefix + Ctrl-r  restore session

  ${bold("Config")}
    Prefix + r       reload ~/.tmux.conf
${cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}
`);
}

// ─── Print banner ──────────────────────────────────────────
function printBanner(): void {
  console.log(
    colors.bold(
      colors.cyan(`
  ████████╗███╗   ███╗██╗   ██╗██╗  ██╗      █████╗ ██╗
     ██╔══╝████╗ ████║██║   ██║╚██╗██╔╝     ██╔══██╗██║
     ██║   ██╔████╔██║██║   ██║ ╚███╔╝      ███████║██║
     ██║   ██║╚██╔╝██║██║   ██║ ██╔██╗      ██╔══██║██║
     ██║   ██║ ╚═╝ ██║╚██████╔╝██╔╝ ██╗     ██║  ██║██║
     ╚═╝   ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝     ╚═╝  ╚═╝╚═╝
`)
    )
  );
  console.log(
    `  ${colors.bold("tmux-ai installer")} — optimized for AI CLI workflows\n`
  );
}

// ─── Uninstall ─────────────────────────────────────────────
async function uninstall(): Promise<void> {
  const os = detectOS();

  // 1. Uninstall neovim plugins & config
  const nvimConfigDir = join(HOME, ".config/nvim");
  const nvimDataDir = join(HOME, ".local/share/nvim");
  const nvimStateDir = join(HOME, ".local/state/nvim");
  const nvimCacheDir = join(HOME, ".cache/nvim");

  const nvimDirs = [
    { path: nvimConfigDir, label: "Neovim config (~/.config/nvim)" },
    { path: nvimDataDir, label: "Neovim data & plugins (~/.local/share/nvim)" },
    { path: nvimStateDir, label: "Neovim state (~/.local/state/nvim)" },
    { path: nvimCacheDir, label: "Neovim cache (~/.cache/nvim)" },
  ];

  for (const { path, label } of nvimDirs) {
    if (existsSync(path)) {
      const shouldRemove = await askYesNo(`Remove ${label}?`);
      if (shouldRemove) {
        rmSync(path, { recursive: true, force: true });
        success(`Removed ${path}`);
      }
    }
  }

  // 2. Uninstall neovim binary
  if (commandExists("nvim")) {
    const shouldUninstall = await askYesNo("Uninstall neovim?");
    if (shouldUninstall) {
      if (os === "macos" && commandExists("brew")) {
        execLive("brew uninstall neovim");
        success("Neovim uninstalled via Homebrew");
      } else if (commandExists("apt-get")) {
        execLive("sudo apt-get remove -y neovim");
        success("Neovim uninstalled via apt");
      } else if (commandExists("yum")) {
        execLive("sudo yum remove -y neovim");
        success("Neovim uninstalled via yum");
      } else if (commandExists("pacman")) {
        execLive("sudo pacman -Rns --noconfirm neovim");
        success("Neovim uninstalled via pacman");
      } else {
        warn("Could not determine package manager. Please uninstall neovim manually.");
      }
    }
  } else {
    info("Neovim is not installed, skipping");
  }

  success("Uninstall complete");
}

// ─── Main ──────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Sub-command: restore a backup
  if (args.includes("--restore") || args.includes("restore")) {
    printBanner();
    await restoreConfig();
    return;
  }

  // Sub-command: uninstall
  if (args.includes("--uninstall") || args.includes("uninstall")) {
    printBanner();
    await uninstall();
    return;
  }

  printBanner();

  const os = detectOS();
  info(`Detected OS: ${os}`);

  ensureBrewShellenv(os);

  let hasPopup = checkTmuxVersion();
  installTmux(os);

  if (!hasPopup) {
    hasPopup = checkTmuxVersion();
  }

  installTPM();
  await checkOptionalDeps(os);
  await setupNeovim();
  backupConfig();
  writeConfig();
  writeTruncateScript();
  writeSessionScript();
  await installPlugins();
  printCheatsheet();

  success(
    `All done! Run ${colors.bold("tai")} to launch your AI workspace.`
  );
}

main().catch((err) => {
  error(String(err));
});