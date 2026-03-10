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
  if (!commandExists("lazygit")) missingOptional.push("lazygit");
  if (!commandExists("bat")) missingOptional.push("bat");
  if (!commandExists("htop")) missingOptional.push("htop");

  if (missingOptional.length > 0) {
    warn(`Optional dependencies not found: ${missingOptional.join(", ")}`);
    warn("Some popup features (Prefix+g/f/m) may not work.");
    if (os === "macos") {
      warn(`Install with: brew install ${missingOptional.join(" ")}`);
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

# ── Pane naming ─────────────────────────────────────────────
bind P command-prompt -p "Pane name:" "run-shell 'printf \\"\\\\\\\\033]2;%%\\\\\\\\033\\\\\\\\\\\\\\\\" > /dev/tty'"

# ── tmux-fzf config ─────────────────────────────────────────
set -g @fzf-url-fzf-options '-p 60%,30% --prompt="   " --border-label=" Open URL "'
set -g @fzf-url-history-limit '2000'
set-environment -g TMUX_FZF_LAUNCH_KEY "F"
set-environment -g TMUX_FZF_ORDER "window|pane|command|keybinding"

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

# ── Status bar (catppuccin/tmux) ─────────────────────────────
set -g status-position top
set -g @catppuccin_flavor 'mocha'
set -g @catppuccin_status_modules_right "application session date_time"
set -g @catppuccin_status_modules_left ""
set -g @catppuccin_date_time_text "%H:%M  %Y-%m-%d"
set -g @catppuccin_window_status_style "rounded"
set -g @catppuccin_window_default_text "#W"
set -g @catppuccin_window_current_text "#W#{?window_zoomed_flag, 🔍,}"
set -g @catppuccin_window_current_color "#89b4fa"
set -g @catppuccin_application_text "#{?pane_title,#{pane_title},#{pane_current_command}}"

# ── Popup 浮动窗口 (tmux 3.2+) ──────────────────────────────
bind g display-popup -E -w 90% -h 90% "command -v lazygit >/dev/null && lazygit || { echo 'lazygit not installed. Run: brew install lazygit'; read; }"
bind f display-popup -E -w 80% -h 80% "command -v fzf >/dev/null && fzf --preview 'command -v bat >/dev/null && bat --color=always --style=numbers {} || cat {}' || { echo 'fzf not installed. Run: brew install fzf'; read; }"
bind m display-popup -E -w 80% -h 80% "command -v htop >/dev/null && htop || top"
bind '\\\\'  display-popup -E -w 80% -h 80% "$SHELL"

# ── Pane border ─────────────────────────────────────────────
set -g pane-border-style "fg=#313244"
set -g pane-active-border-style "fg=#89b4fa"
set -g pane-border-status top
set -g pane-border-format " #{?pane_title,#{pane_title},pane #P} "

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

// ─── Write AI session launcher script ──────────────────────
function writeSessionScript(): void {
  const scriptPath = join(LOCAL_BIN, "tmux-ai-session");

  if (!existsSync(LOCAL_BIN)) {
    mkdirSync(LOCAL_BIN, { recursive: true });
  }

  const script = `#!/usr/bin/env bash
# tmux-ai-session: Launch a pre-configured AI workspace session
SESSION="ai-workspace"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already exists. Attaching..."
  tmux attach-session -t "$SESSION"
  exit 0
fi

tmux new-session -d -s "$SESSION" -n "main"
tmux send-keys -t "$SESSION:main" "echo '🤖 AI Workspace ready'" Enter

tmux new-window -t "$SESSION" -n "claude"
tmux send-keys -t "$SESSION:claude" "# claude / anthropic cli here" Enter

tmux new-window -t "$SESSION" -n "gpt"
tmux send-keys -t "$SESSION:gpt" "# openai / other ai cli here" Enter

tmux new-window -t "$SESSION" -n "monitor"
tmux split-window -h -t "$SESSION:monitor"
if command -v htop &>/dev/null; then
  tmux send-keys -t "$SESSION:monitor.1" "htop" Enter
else
  tmux send-keys -t "$SESSION:monitor.1" "# htop not installed" Enter
fi
tmux send-keys -t "$SESSION:monitor.2" "# notes / logs" Enter

tmux select-window -t "$SESSION:main"
tmux attach-session -t "$SESSION"
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
      warn("Run 'source " + shellRc + "' to use 'tmux-ai-session' command");
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
    tmux-ai-session  launch AI workspace
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

// ─── Main ──────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Sub-command: restore a backup
  if (args.includes("--restore") || args.includes("restore")) {
    printBanner();
    await restoreConfig();
    return;
  }

  printBanner();

  const os = detectOS();
  info(`Detected OS: ${os}`);

  let hasPopup = checkTmuxVersion();
  installTmux(os);

  if (!hasPopup) {
    hasPopup = checkTmuxVersion();
  }

  installTPM();
  await checkOptionalDeps(os);
  backupConfig();
  writeConfig();
  writeSessionScript();
  await installPlugins();
  printCheatsheet();

  success(
    `All done! Run ${colors.bold("tmux-ai-session")} to launch your AI workspace.`
  );
}

main().catch((err) => {
  error(String(err));
});