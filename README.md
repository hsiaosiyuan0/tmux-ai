# Manage Your AI Terminals with tmux

[中文文档](./README-zh-CN.md)

> Switching between Claude, GPT, and Aider all day? Try putting them all in one window.

---

## The Problem

You've probably experienced these situations:

- Four or five terminal windows open on your desktop—one for Claude, one for GPT, one for Aider, one for htop... `Cmd+Tab` until your fingers hurt and still can't find the one you want
- AI running halfway through a task, accidentally close the terminal, task gone, tokens wasted
- Want to see Claude's output and code side by side, but have to drag windows around to align them
- Every day after booting up, reopen a bunch of terminals, cd to project directories, start various tools

The root cause is simple: **regular terminal windows are bound to the programs running inside them**. Close the window, the program dies. Too many windows, desktop becomes chaos.

tmux solves exactly this problem.

---

## What tmux Can Do for You

In one sentence: **Manage all your AI CLIs in a single terminal window, switch anytime, and nothing is lost even if you close the window**.

Specifically:

| Pain Point | How tmux Solves It |
|------------|-------------------|
| Too many windows, messy desktop | All tools in one tmux window, switch instantly with number keys |
| Close terminal, task is gone | tmux runs in background, closing terminal just "disconnects", reopen to reconnect |
| Want to see two things at once | Split screen, AI on left, code on right, close with one key when done |
| Reopen everything every day | Save layout, restore with one key even after reboot |

---

## Up and Running in 5 Minutes

Don't worry about the theory, just get it running first.

```bash
# Option 1: One-line install with npx (Recommended)
npx tmux-ai

# Option 2: Global install
npm i -g tmux-ai
tmux-ai

# Launch AI workspace (session & window named after current directory)
tai

# Launch with specific windows
tai --windows main,claude,gpt,monitor

# Custom session name
tai --session my-project --windows main,claude
```

`tai` creates a pre-configured workspace for you. By default, the session and window are named after the current directory. Available windows:

| Window | Description |
|--------|-------------|
| `claude` | For Claude CLI |
| `gpt` | For GPT / Gemini |
| `monitor` | htop + logs (split pane) |
| Any name | Custom empty window |

Example with all windows:

```
my-project           ← session named after current dir
├── my-project   ← default window
├── claude       ← for Claude CLI
├── gpt          ← for GPT / Gemini
└── monitor      ← htop + logs
```

Now try these operations:

| Keys | What It Does |
|------|--------------|
| `Ctrl-a` then `2` | Jump to claude window |
| `Ctrl-a` then `3` | Jump to gpt window |
| `Ctrl-a` then `d` | Exit tmux (still running in background) |
| Type `tmux a` in terminal | Reconnect, everything is still there |

`Ctrl-a` is tmux's "prefix key", referred to as `Prefix` from now on. All tmux shortcuts are: press Prefix, release, then press another key.

---

## Understanding the Three-Layer Structure

After using it for a while, you'll notice tmux has three layers: Session, Window, Pane.

Don't be scared by these terms. A Chrome analogy makes it easy:

| tmux Concept | Chrome Analogy | What You See |
|--------------|----------------|--------------|
| **Session** | Multiple Chrome profiles (one for work, one personal) | A complete work environment |
| **Window** | A browser tab | The row of names at the bottom status bar |
| **Pane** | Split view within a tab | Current screen divided into sections |

Here's a diagram:

```
Session: ai-workspace (your AI workspace)
├── Window 1: main     ← full screen, run daily commands
├── Window 2: claude   ← full screen, run Claude CLI
├── Window 3: gpt      ← full screen, run GPT
└── Window 4: monitor  ← full screen, but split into two Panes
    ├── Pane 1 (left): htop
    └── Pane 2 (right): view logs
```

**Recommended Usage:**

- Each AI CLI gets its own **Window** (full screen, no interference)
- Split into **Panes** only when comparing (temporary split, close when done)
- Press `Prefix + number` to switch windows instantly, build muscle memory

The key difference: Window is "switch the entire screen", Pane is "divide current screen into sections".

---

## Why Things Persist After Closing Terminal

This is tmux's magic, worth explaining separately.

The secret is that tmux has **two parts**:

```
┌─────────────────────────────────────┐
│  Your terminal window (iTerm2/Terminal) │  ← This is just a "monitor"
│                                     │
│  ┌─────────────────────────────────┐    │
│  │  tmux server (background process) │    │  ← Real work happens here
│  │                             │    │
│  │  - Session: ai-workspace    │    │
│  │    - Window: claude         │    │
│  │    - Window: gpt            │    │
│  │    ...                      │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

When you close the terminal window, you're just closing the "monitor". The tmux server is still running in the background, Claude is still waiting for your input.

Next time you open a terminal and run `tmux attach` (or `tmux a`), it's like reconnecting the monitor—screen content intact.

This is why you can:

- Let AI run a long task, close your laptop for a meeting, come back to see results
- SSH to a server, run a long task, disconnect SSH, attach tomorrow to check
- Restart computer (with tmux-resurrect plugin), previous window layout can still be restored

> **Tip**: `Prefix + d` only detaches—both the session and server keep running. If you want to close a specific session while keeping the tmux server alive (other sessions unaffected), first run `tmux ls` to see all sessions, then use `tmux kill-session -t SESSION_NAME` to close the one you want.

---

## Daily Usage Tips

### Switching Between Sessions

No need to detach from the current session—you can switch directly:

```
Prefix + s    → Pop up session list, select and Enter to switch
Prefix + S    → sessionx manager (fuzzy search, preview)
Prefix + (    → Previous session
Prefix + )    → Next session
```

For example, if you have `ai-workspace` and `project-b` sessions, press `Prefix + s` to switch between them. Each session's windows and panes stay exactly as they were.

### Quick Window Switching

When you don't have many windows, use number keys:

```
Prefix + 1    → Jump to Window 1
Prefix + 2    → Jump to Window 2
Prefix + Tab  → Next window
```

Too many windows to remember numbers? Use fuzzy search:

```
Prefix + F    → Pop up search box, type "cl" to find claude
```

### Temporary Split Screen

In the Claude window, want AI output on left and code on right:

```
Prefix + |    → Split horizontally
Prefix + h/l  → Switch between the two Panes
Prefix + x    → Close current Pane, back to full screen
```

### Zoom Current Pane

In split mode, want to focus on one Pane:

```
Prefix + z    → Zoom current Pane to full screen
Prefix + z    → Press again to restore split
```

Status bar shows a zoom indicator when in zoom mode.

### Copy AI Output

AI outputs a long code block, want to copy it:

```
Prefix + Enter   → Enter copy mode (can scroll, select)
v                → Start selection
y                → Copy to system clipboard
```

Much faster than mouse dragging, and you can scroll up to see history.

### Save and Restore Window Layout

```
Prefix + Ctrl-s   → Save current layout
Prefix + Ctrl-r   → Restore layout
```

With `tmux-continuum` plugin, auto-saves every 15 minutes. Survives reboots.

---

## Popup Shortcuts

Some tools you only glance at occasionally, not worth a dedicated Window. Use popups:

| Keys | What Pops Up | How to Close |
|------|--------------|--------------|
| `Prefix + g` | lazygit | `q` to quit |
| `Prefix + m` | htop | `q` to quit |
| `Prefix + f` | File search (fzf + preview) | `Esc` or auto-close after selection |
| `Prefix + \` | Temporary shell | `exit` |

Popups are floating, won't disrupt your current window layout.

---

## Plugins

This configuration comes with several useful plugins pre-installed:

| Plugin | What It Does |
|--------|--------------|
| **tmux-resurrect** | Save/restore window layout |
| **tmux-continuum** | Auto-save every 15 minutes |
| **tmux-yank** | Copy to system clipboard |
| **tmux-fzf** | Fuzzy search windows |
| **tmux-sessionx** | More powerful session management |

Plugins are managed by **TPM** (Tmux Plugin Manager), similar to npm. To install a new plugin, add `set -g @plugin '...'` in `~/.tmux.conf`, then press `Prefix + I` to install.

---

## What install.sh / npx tmux-ai Does

In short:

1. **Install tmux** (brew on macOS, system package manager on Linux)
2. **Install TPM** (plugin manager)
3. **Write `~/.tmux.conf`** (keybindings, colors, plugin list)
4. **Write `tai` script** (launch AI workspace with configurable windows)
5. **Auto-install plugins**

Don't worry about breaking existing config—if you have an existing `.tmux.conf`, the script backs it up first.

---

## Keybinding Cheat Sheet

> Prefix = `Ctrl-a`

**Window Management**

| Keys | Function |
|------|----------|
| `Prefix + c` | New window |
| `Prefix + 1~9` | Jump to window N |
| `Prefix + Tab` | Next window |
| `Prefix + ,` | Rename window (auto-disables auto-rename) |
| `Prefix + &` | Close window |
| `Prefix + F` | Fuzzy search jump |

**Panes**

| Keys | Function |
|------|----------|
| `Prefix + \|` | Split horizontally |
| `Prefix + -` | Split vertically |
| `Prefix + h/j/k/l` | Move between panes |
| `Prefix + z` | Zoom/restore current pane |
| `Prefix + x` | Close current pane |

**Sessions**

| Keys | Function |
|------|----------|
| `Prefix + d` | Detach (keeps running in background) |
| `Prefix + s` | Built-in session list (arrow keys to select, Enter to switch) |
| `Prefix + S` | Session manager (sessionx, more powerful) |
| `Prefix + (` / `)` | Switch to previous / next session |
| `tai` | Launch AI workspace |
| `tmux ls` | List all sessions |
| `tmux kill-session -t NAME` | Close a session (server keeps running) |

**Copy Mode**

| Keys | Function |
|------|----------|
| `Prefix + Enter` | Enter copy mode |
| `v` | Start selection |
| `y` | Copy to clipboard |

**Other**

| Keys | Function |
|------|----------|
| `Prefix + r` | Reload config |
| `Prefix + Ctrl-s` | Save layout |
| `Prefix + Ctrl-r` | Restore layout |
| `Prefix + I` | Install plugins |

---

## Quick Start

```bash
npx tmux-ai
tai
```

In 5 minutes you'll have a terminal environment dedicated to AI workflows.

## Terminal Compatibility Troubleshooting

If you experience scrollback issues, broken colors, or clipboard problems with terminals like Ghostty, Kitty, etc., check that `~/.tmux.conf` contains these two lines (already included by tmux-ai):

```bash
set -g default-terminal "screen-256color"
set -ag terminal-overrides ",xterm-256color:RGB"
```

What these do:
- The first line tells tmux to use 256-color terminal mode
- The second line enables true color (24-bit RGB) so color schemes render correctly

If issues persist, try replacing `screen-256color` with `tmux-256color`:

```bash
set -g default-terminal "tmux-256color"
set -ag terminal-overrides ",xterm-256color:RGB"
```

> **Terminal recommendations**: On macOS, iTerm2 has the best tmux compatibility (supports `tmux -CC` native integration). WezTerm is also solid and cross-platform. Ghostty and Kitty generally work well but may occasionally need the above tweaks.

---

Questions? Open an Issue.
