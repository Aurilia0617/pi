# 本仓库说明与升级指南（main 模型）

本仓库 `main`（`~/project/pi`）= 上游最新 tag + 少量本地提交（1 个功能：cursor-first prompt history navigation，其余为文档）。
`~/.zshrc` 的 `pi()` 固定指向 `$HOME/project/pi/pi-test.sh`，**升级不需要改 zshrc**；改代码立即生效，无需构建。

## 与上游的唯一行为差别：光标优先的历史导航

设置项 `editorHistoryCursorFirst`（pi 默认 `true`，可在 `/settings` 或 `settings.json` 关闭）。
设为 `false` 时行为与上游逐分支等价（真值表穷举验证：84 种状态组合零差异）。

| 状态 | 上游 | 本地（默认 true） |
|---|---|---|
| 空编辑器按 ↑ | 切历史 | 同上游 |
| 有草稿、光标行中按 ↑ | 先跳行首 | 同上游 |
| **浏览历史中、首行、光标不在行首按 ↑** | **立刻切上一条** | **先移到行首，再按才切** |
| **浏览历史中、末行、光标不在行末按 ↓** | **立刻切下一条/退出** | **先移到行末，再按才切** |

未改动：`navigateHistory()` 状态机、`historyDraft` 草稿快照与恢复、专用历史键（`tui.editor.historyPrevious/historyNext`，不受光标位置影响）。

## 设计理念

1. **单一闸门，不改流程**。所有差异收敛在私有谓词 `Editor.shouldSwitchHistory(direction)`（`packages/tui/src/components/editor.ts`）。历史导航状态机零改动，`false` 即上游。
2. **分层默认值**。TUI 库（`pi-tui`，独立发布包）默认 `false` 保持上游行为，不伤害其他消费者；pi 产品默认 `true` 收敛在 `SETTINGS_DEFAULTS.editorHistoryCursorFirst`（`packages/coding-agent/src/core/settings-defaults.ts`），settings-manager 与 schema 共享同一来源。tui 的 JSDoc 只说 "applications can opt in"，不引用 coding-agent 内部符号。
3. **与上游模式同构**。复刻 `paddingX` 的接线方式：构造参数 + `applyRuntimeSettings()` 重应用 + `EditorComponent` 可选 setter + 扩展替换编辑器时复制 + `/settings` 面板回调。同步点共 4 处，各有独立必要路径（构造初值 / rebind / `setCustomEditorComponent` 不经过 applyRuntimeSettings / 面板即时生效），不要为了减点数去改上游函数结构。
4. **产物同步**。`schemas/settings.schema.json` 由 `npm run generate:schemas` 生成，改 schema 源后必须重新生成，否则编辑器 `$schema` 校验不认新字段。
5. **有意取舍**：不写 `CHANGELOG.md`（上游高频改动文件，fork 本地条目每次合并都要手动解冲突）。

## 历史遗留（旧 main，2026-10-26 废弃，仅 reflog 可救）

- `packages/ai/src/utils/retry.ts` 裸 `"temporarily unavailable"` 重试：网关会报不带 `service` 前缀的文案，上游正则匹配不到。若仍需要，在 `RETRYABLE_PROVIDER_ERROR_PATTERN` 里加一行 `"temporarily unavailable"` 即可（非重试名单先于它判断，不会误伤 ChatGPT 订阅类报错）；上游自己的状态码边界正则 `(?<![a-z0-9])(?:429|...)` 更优，勿用旧裸码。
- `LOCAL_DEV_MACOS.md`、`README.local.md`：内容已并入本文档。
- `package.json` build 顺序调整：无必要（telemetry 无依赖），弃用。

## 升级流程（中间分支 → 移动 main → 推送 → 删中间分支）

自始至终只有一条 `main`（本地与 fork 同步）；`vX.Y.Z-local` 只是每次升级的**临时中间分支**，验证完成即删，从不推送。

1. **建中间分支**（用 worktree，不打扰正在运行的会话）：
   ```bash
   cd ~/project/pi
   git status --short                                # main 必须干净
   git fetch upstream --tags
   git worktree add ~/project/pi-vX.Y.Z-local -b vX.Y.Z-local vX.Y.Z
   cd ~/project/pi-vX.Y.Z-local
   npm ci
   npm --prefix packages/ai run generate-models   # 生成 providers/data（gitignore，npm ci 不产出，测试会缺模块）
   ```
2. **迁移与重审**（中间分支上做，核心思想：以新代码最好的方式重新实现，不搬补丁）：
   - 参考旧实现：`git diff <旧tag> main -- <files>`，逐处重审：谓词逻辑、面板 splice 链、`SETTINGS_DEFAULTS`、schema 生成产物
   - 先确认上游没有自己实现（`git grep -i 'historyCursor\|cursorFirst'`），且 `cursorUp/cursorDown` 段、`applyRuntimeSettings` 有无结构变化
   - 提交单个 feature commit，并更新本文档（版本号、流程、改进记录）
3. **验证清单**（全部通过后再继续，commit 时 pre-commit 会再跑一遍全家桶）：
   ```bash
   cd packages/tui && node --test test/*.test.ts            # 含上游 #5789 回归用例
   cd ../coding-agent && npx vitest run test/settings-manager.test.ts test/settings-selector.test.ts
   npx tsc -p tsconfig.build.json --noEmit                  # tui 与 coding-agent 各一次
   npx biome check --write <改动文件>
   npm run generate:schemas                                 # 确认 settings.schema.json 无 diff
   # 冒烟：PI_CODING_AGENT_DIR=<临时目录> node --import <resolver> packages/coding-agent/src/cli.ts --version
   ```
4. **移动 main 并推送 fork**（fork 的 main 始终 = 最新上游 tag + 本地提交）：
   ```bash
   git -C ~/project/pi switch main
   git -C ~/project/pi reset --hard vX.Y.Z-local
   git -C ~/project/pi push --force-with-lease origin main
   ```
5. **重启 pi**（运行中的会话继续用启动时的代码），然后清理中间分支：
   ```bash
   git -C ~/project/pi worktree remove ~/project/pi-vX.Y.Z-local
   git -C ~/project/pi branch -D vX.Y.Z-local
   ```

## 从零设置（全新 Mac）

前置：Homebrew、Git、Node ≥ 22.19。

```bash
# 1. 克隆自己的 fork（已含 main），配 upstream
git clone <你的 fork> ~/project/pi
git -C ~/project/pi remote add upstream https://github.com/earendil-works/pi.git

# 2. 依赖
cd ~/project/pi && npm ci && npm --prefix packages/ai run generate-models

# 3. 配置目录（首次）
mkdir -p ~/Documents/pi_config
```

`~/.zshrc` 写一次、以后不再改（配置统一放自定义目录，不碰默认 `~/.pi/agent`）：

```zsh
export PI_CODING_AGENT_DIR="$HOME/Documents/pi_config"
export PI_ASK_USER_DISPLAY_MODE=inline

pi() {
  PI_CODING_AGENT_DIR="$HOME/Documents/pi_config" \
    "$HOME/project/pi/pi-test.sh" "$@"
}
```

验证：`source ~/.zshrc && type pi && pi --version`。

说明：`pi-test.sh` 被 git 跟踪且保留可执行位，检出即用；函数内重复传 `PI_CODING_AGENT_DIR` 是为了显式覆盖，防止外部环境变量漂移。

## 改进记录

- **2026-10-26（v1.4.0 重实现）**：
  - 判定逻辑从两段内联条件抽为 `shouldSwitchHistory()` 谓词，两方向语义一致、可穷举验证；
  - 默认值收敛到 `SETTINGS_DEFAULTS` 单一来源；
  - 补齐 `schemas/settings.schema.json` 再生成（旧版遗漏）；
  - 面板条目移到编辑器设置区（`editor-padding` 之后）并补 description；
  - tui JSDoc 去掉对 coding-agent 内部常量的引用；
  - 删除重复的 suite reload 测试（已被 settings-manager round-trip 覆盖）。
- **2026-10-26（切换 main 模型）**：自始至终只维护一条 `main`（本地与 fork 同步）；升级流程 = `vX.Y.Z-local` 中间分支重新实现 → 移动 main → `--force-with-lease` 推送 fork → 删中间分支；`pi()` 固定指向 `~/project/pi`，升级不改 zshrc；旧 main 的本地差异收敛进「历史遗留」一节。
- **未做、供后续参考**：
  - 上游化：以策略钩子形态（`ctx.ui.addHistoryNavigationPolicy`，对称于 `addAutocompleteProvider`）提 PR 的接受度高于布尔开关；上游若合并，本补丁可整体删除，仅在 `SETTINGS_DEFAULTS` 保留默认值。
  - 扩展接口（`ctx.ui.setHistoryCursorFirst`，约 6 行）等真有第二个消费者再加。
