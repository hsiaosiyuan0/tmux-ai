# 用 tmux 管理你的 AI 终端

> 每天在 Claude、GPT、Aider 之间来回切换？试试把它们全塞进一个窗口。

---

## 先说问题

你大概也遇到过这些情况：

- 桌面上开了四五个终端窗口，Claude 一个、GPT 一个、Aider 一个、htop 一个……`Cmd+Tab` 按到手酸也找不到想要的那个
- AI 跑到一半，不小心关了终端，任务没了，token 白花
- 想同时看 Claude 的输出和代码文件，只能把两个窗口拖来拖去对齐
- 每天开机都要重新打开一堆终端、cd 到项目目录、启动各种工具

这些问题的根源很简单：**普通终端窗口和里面跑的程序是绑定的**。窗口关了，程序就死了。窗口多了，桌面就乱了。

tmux 解决的就是这个问题。

---

## tmux 能帮你做什么

一句话：**一个终端窗口里，管理所有 AI CLI，随时切换，关掉窗口也不会丢**。

具体来说：

| 痛点 | tmux 怎么解决 |
|------|--------------|
| 窗口太多，桌面混乱 | 所有工具塞进一个 tmux 窗口，按数字键秒切 |
| 关掉终端任务就没了 | tmux 在后台跑，关掉终端只是"断开连接"，重新打开就接回来 |
| 想同时看两个东西 | 分屏，左边 AI 右边代码，用完一键关掉 |
| 每天重新开一堆窗口 | 保存布局，重启电脑也能一键恢复 |

---

## 五分钟跑起来

先别管原理，跑起来再说。

```bash
# 方式一：npx 一键安装（推荐）
npx tmux-ai

# 方式二：全局安装
npm i -g tmux-ai
tmux-ai

# 启动 AI 工作区
tmux-ai-session
```

`tmux-ai-session` 会帮你创建一个预设好的工作区：

```
ai-workspace
├── main      ← 日常 shell
├── claude    ← 放 Claude CLI
├── gpt       ← 放 GPT / Gemini
└── monitor   ← htop + 日志
```

现在试试这几个操作：

| 按键 | 干什么 |
|------|--------|
| `Ctrl-a` 然后 `2` | 跳到 claude 窗口 |
| `Ctrl-a` 然后 `3` | 跳到 gpt 窗口 |
| `Ctrl-a` 然后 `d` | 退出 tmux（后台还在跑）|
| 终端里输入 `tmux a` | 重新连回去，刚才的东西都在 |

`Ctrl-a` 是 tmux 的"前缀键"，后面简称 `Prefix`。所有 tmux 快捷键都是先按 Prefix，松开，再按另一个键。

---

## 理解三层结构

用了一会儿，你会发现 tmux 有三层东西：Session、Window、Pane。

别被这些名词吓到，用 Chrome 来类比就很好懂：

| tmux 概念 | Chrome 类比 | 你看到的 |
|-----------|-------------|----------|
| **Session** | Chrome 多开（工作账号一个、个人账号一个） | 一整套工作环境 |
| **Window** | 一个标签页 | 状态栏底部那一排名字 |
| **Pane** | 标签页里的分屏 | 当前屏幕被分成几块 |

画个图：

```
Session: ai-workspace（你的 AI 工作区）
├── Window 1: main     ← 一整屏，跑日常命令
├── Window 2: claude   ← 一整屏，跑 Claude CLI
├── Window 3: gpt      ← 一整屏，跑 GPT
└── Window 4: monitor  ← 一整屏，但分成了两个 Pane
    ├── Pane 1 (左): htop
    └── Pane 2 (右): 看日志
```

**推荐用法：**

- 每个 AI CLI 占一个 **Window**（全屏，互不干扰）
- 需要对比的时候再分 **Pane**（临时分屏，用完关掉）
- 按 `Prefix + 数字` 秒切窗口，形成肌肉记忆

Window 和 Pane 最大的区别：Window 是"换一整屏"，Pane 是"当前屏幕切几块"。

---

## 为什么关掉终端东西还在

这是 tmux 最神奇的地方，值得单独讲一下。

秘密在于 tmux 是**两个部分**：

```
┌─────────────────────────────────────┐
│  你看到的终端窗口（iTerm2 / Terminal）│  ← 这只是个"显示器"
│                                     │
│  ┌─────────────────────────────────┐    │
│  │  tmux server（后台进程）     │    │  ← 真正干活的在这
│  │                             │    │
│  │  - Session: ai-workspace    │    │
│  │    - Window: claude         │    │
│  │    - Window: gpt            │    │
│  │    ...                      │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

你关掉终端窗口，只是关掉了"显示器"。tmux server 还在后台跑着，Claude 还在等你输入。

下次打开终端，执行 `tmux attach`（或者 `tmux a`），就像重新接上显示器——屏幕内容原封不动。

这就是为什么你可以：

- 让 AI 跑一个耗时任务，关掉笔记本去开会，回来看结果
- SSH 到服务器，跑个长任务，断开 SSH，明天再 attach 上去看
- 电脑重启（配合 tmux-resurrect 插件），之前的窗口布局还能恢复

---

## 日常使用的几个技巧

### 快速切换窗口

窗口不多的时候，靠数字键：

```
Prefix + 1    → 跳到 Window 1
Prefix + 2    → 跳到 Window 2
Prefix + Tab  → 下一个窗口
```

窗口多了记不住编号？用模糊搜索：

```
Prefix + F    → 弹出搜索框，输入 "cl" 就能找到 claude
```

### 临时分屏

在 Claude 窗口里，想左边看 AI 输出、右边看代码：

```
Prefix + |    → 左右分屏
Prefix + h/l  → 在两个 Pane 之间切换
Prefix + x    → 关掉当前 Pane，回到全屏
```

### 放大当前 Pane

分屏状态下，想专心看一个 Pane 的内容：

```
Prefix + z    → 当前 Pane 放大到全屏
Prefix + z    → 再按一次，恢复分屏
```

状态栏会显示 🔍 提示你正在 zoom 模式。

### 复制 AI 的输出

AI 输出了一大段代码，想复制出来：

```
Prefix + Enter   → 进入 copy mode（可以滚动、选择）
v                → 开始选择
y                → 复制到系统剪贴板
```

比鼠标拖选快多了，而且能往上滚动看历史输出。

### 保存和恢复窗口布局

```
Prefix + Ctrl-s   → 保存当前布局
Prefix + Ctrl-r   → 恢复布局
```

配合 `tmux-continuum` 插件，每 15 分钟自动保存。电脑重启也能恢复。

---

## 几个弹窗快捷键

有些工具你只是偶尔瞄一眼，不值得单独占一个 Window。用弹窗：

| 按键 | 弹出什么 | 怎么关 |
|------|----------|--------|
| `Prefix + g` | lazygit | `q` 退出 |
| `Prefix + m` | htop | `q` 退出 |
| `Prefix + f` | 文件搜索（fzf + 预览）| `Esc` 或选择后自动关 |
| `Prefix + \` | 临时 shell | `exit` |

弹窗是浮动的，不会打乱你当前的窗口布局。

---

## 插件

这套配置已经帮你装好了几个实用插件：

| 插件 | 干什么 |
|------|--------|
| **tmux-resurrect** | 保存/恢复窗口布局 |
| **tmux-continuum** | 自动保存，每 15 分钟一次 |
| **tmux-yank** | 复制到系统剪贴板 |
| **tmux-fzf** | 模糊搜索窗口 |
| **tmux-sessionx** | 更强大的 Session 管理 |

插件由 **TPM**（Tmux Plugin Manager）管理，类似 npm。想装新插件，在 `~/.tmux.conf` 里加一行 `set -g @plugin '...'`，然后按 `Prefix + I` 安装。

---

## install.sh / npx tmux-ai 干了什么

简单说：

1. **装 tmux**（macOS 用 brew，Linux 用系统包管理器）
2. **装 TPM**（插件管理器）
3. **写 `~/.tmux.conf`**（快捷键、配色、插件列表）
4. **写 `tmux-ai-session` 脚本**（一键启动预设工作区）
5. **自动装插件**

不用担心搞坏现有配置——如果你之前有 `.tmux.conf`，脚本会先备份。

---

## 快捷键速查

> Prefix = `Ctrl-a`

**窗口管理**

| 按键 | 功能 |
|------|------|
| `Prefix + c` | 新建窗口 |
| `Prefix + 1~9` | 跳到第 N 个窗口 |
| `Prefix + Tab` | 下一个窗口 |
| `Prefix + ,` | 重命名窗口 |
| `Prefix + &` | 关闭窗口 |
| `Prefix + F` | 模糊搜索跳转 |

**分屏**

| 按键 | 功能 |
|------|------|
| `Prefix + \|` | 左右分 |
| `Prefix + -` | 上下分 |
| `Prefix + h/j/k/l` | 在 Pane 之间移动 |
| `Prefix + z` | 放大/还原当前 Pane |
| `Prefix + x` | 关闭当前 Pane |

**Session**

| 按键 | 功能 |
|------|------|
| `Prefix + d` | 断开（后台继续跑）|
| `Prefix + S` | Session 管理器 |
| `tmux-ai-session` | 启动 AI 工作区 |
| `tmux ls` | 列出所有 Session |

**复制**

| 按键 | 功能 |
|------|------|
| `Prefix + Enter` | 进入 copy mode |
| `v` | 开始选择 |
| `y` | 复制到剪贴板 |

**其他**

| 按键 | 功能 |
|------|------|
| `Prefix + r` | 重新加载配置 |
| `Prefix + Ctrl-s` | 保存布局 |
| `Prefix + Ctrl-r` | 恢复布局 |
| `Prefix + I` | 安装插件 |

---

## 快速开始

```bash
npx tmux-ai
tmux-ai-session
```

五分钟后你就有了一个 AI 专用的终端环境。

有问题？开 Issue。
