# macOS 最简安装：从本地仓库运行 Pi 并指定配置文件夹

目标只有两个：

- `pi` 命令运行的是**本地仓库源码**（改完代码立即生效，无需构建）
- 配置统一放在**自定义目录**，不碰默认的 `~/.pi/agent`

## 1. 前置条件：Homebrew、Git 和 Node.js >= 22.19.0

### 1.1 Homebrew（可选，推荐）

Homebrew 是 macOS 的包管理器，下面的 Git、Node.js 都可以用它安装。先检查是否已安装：

```bash
brew --version
```

如果没有，执行官方安装脚本：

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

安装脚本会先检查 Command Line Tools，缺失时会提示安装（需要输入登录密码），按屏幕提示操作即可。

安装完成后：

1. 安装器会写入 `/etc/paths.d/homebrew`（内容 `/opt/homebrew/bin`），登录 shell 通过系统的 `path_helper` 自动把它加进 `PATH`。
2. 把 brew 环境写进 `~/.zshrc`，补全 `PATH`、`MANPATH`、`HOMEBREW_*` 等变量，并用 `zsh` 参数一并加载 zsh 补全：

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv zsh)"' >> ~/.zshrc
eval "$(/opt/homebrew/bin/brew shellenv zsh)"
brew --version
```

`~/.zshrc` 里已有这行就不用重复添加。不写这一行也不会出现 `brew: command not found`（靠第 1 步的系统 PATH 兜底），它主要补齐补全函数和 `HOMEBREW_*` 等变量。

### 1.2 Git

macOS 自带 `git` 命令的占位程序，运行下面任一命令会提示安装 Command Line Tools（含 Git）：

```bash
git --version
# 或手动触发安装
xcode-select --install
```

如果是交互式安装窗口，确认安装，装完验证：

```bash
git --version
```

如果已经完成 1.1（安装了 Homebrew），也可以用它单独装较新的 Git：

```bash
brew install git
```

### 1.3 Node.js >= 22.19.0

Pi 的 `package.json` 要求 Node.js 22.19.0 及以上（`./pi-test.sh` 依赖 Node 原生 TypeScript 支持）。

先检查：

```bash
node -v
```

未安装或版本过低，任选一种方式：

**方式 A：Homebrew（推荐，需先完成 1.1）**

```bash
brew install node    # 当前版本，满足 >= 22.19.0
node -v
```

**方式 B：官方安装包**

到 <https://nodejs.org/en/download> 下载 macOS Installer（`.pkg`），选 22.x LTS 或更新版本，安装后执行 `node -v` 确认。

安装完如果提示 `command not found: node`，新开一个终端；仍不行则确认 Homebrew 的 bin 目录在 `PATH` 里（Apple Silicon 为 `/opt/homebrew/bin`）：

```bash
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc
```

## 2. 安装 Pi（两步）

```bash
git clone https://github.com/earendil-works/pi.git "$HOME/project/pi"
cd "$HOME/project/pi"
npm install --ignore-scripts
```

- 必须加 `--ignore-scripts`：仓库默认不在安装时执行依赖的生命周期脚本。
- 不需要 `npm run build`，不需要 `npm link`，也不需要全局安装 npm 包。
- 只需在仓库根目录安装一次，不用进 `packages/coding-agent`。

## 3. .zshrc 设置（`pi` 命令 + 配置文件夹）

交互终端里让 `pi` 指向本地仓库，并指定配置目录。编辑 `~/.zshrc`，加入：

```zsh
# --- Pi: 本地源码启动 + 独立配置目录 ---
export PI_CODING_AGENT_DIR="$HOME/Documents/pi_config"

pi() {
  PI_CODING_AGENT_DIR="$HOME/Documents/pi_config" \
    "$HOME/project/pi/pi-test.sh" "$@"
}
```

生效与验证：

```bash
source ~/.zshrc      # 或直接新开一个终端
type pi              # 应显示: pi is a shell function from ~/.zshrc
pi --version         # 输出本地仓库 packages/coding-agent/package.json 里的版本号
```

说明：

- `PI_CODING_AGENT_DIR` 指定配置文件夹（agent 目录），默认是 `~/.pi/agent`，没有对应的 CLI 参数，启动时读取。
- 配置目录不需要提前创建：首次启动时 Pi 会自动生成 `settings.json`、`sessions/` 等。想复用旧配置就把 `auth.json`（凭据，注意权限）、`models.json` 等复制过来。
- 交互式 zsh 里 `pi` 优先命中这个函数，覆盖 PATH 里的同名命令；`command pi` 可以绕过函数调用 PATH 里的版本。
- 函数只在**交互式 zsh** 生效。脚本、IDE、GUI 应用不加载 `~/.zshrc`，需要在 PATH 上另外放包装脚本才能用 `pi`。
- 参数会原样转发，工作目录保持为调用时的目录：

  ```bash
  cd ~/some-project && pi            # 交互模式，工作目录 ~/some-project
  pi -p "总结一下这个仓库"            # print 模式
  ```
