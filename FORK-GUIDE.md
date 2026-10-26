# v1.4.0-local 分支说明与升级指南

本分支 = 上游 `v1.4.0`（`4a080252f`）+ **一个**本地提交：cursor-first prompt history navigation。
worktree 位于 `~/project/pi-v1.4.0-local`，用 `./pi-test.sh` 从源码运行。

## 与上游的唯一行为差别：光标优先的历史导航

设置项 `editorHistoryCursorFirst`（pi 默认 `true`，可在 `/settings` 或 `settings.json` 关闭）。
设为 `false` 时行为与上游逐分支等价（已用真值表穷举验证：谓词 vs 上游条件，84 种状态组合零差异）。

| 状态 | 上游 | 本分支（默认 true） |
|---|---|---|
| 空编辑器按 ↑ | 切历史 | 同上游 |
| 有草稿、光标行中按 ↑ | 先跳行首 | 同上游 |
| **浏览历史中、首行、光标不在行首按 ↑** | **立刻切上一条** | **先移到行首，再按才切** |
| **浏览历史中、末行、光标不在行末按 ↓** | **立刻切下一条/退出** | **先移到行末，再按才切** |

未改动：`navigateHistory()` 状态机、`historyDraft` 草稿快照与恢复、专用历史键（`tui.editor.historyPrevious/historyNext`，不受光标位置影响）。

## 设计理念

1. **单一闸门，不改流程**。所有差异收敛在一个私有谓词 `Editor.shouldSwitchHistory(direction)`（`packages/tui/src/components/editor.ts`）。历史导航状态机零改动，`false` 即上游。
2. **分层默认值**。TUI 库（`pi-tui`，独立发布包）默认 `false` 保持上游行为，不伤害其他消费者；pi 产品默认 `true` 收敛在 `SETTINGS_DEFAULTS.editorHistoryCursorFirst`（`packages/coding-agent/src/core/settings-defaults.ts`），settings-manager 与 schema 共享同一来源。tui 的 JSDoc 只说 "applications can opt in"，不引用 coding-agent 内部符号。
3. **与上游模式同构**。完全复刻 `paddingX` / `autocompleteMaxVisible` 的接线方式：构造参数 + `applyRuntimeSettings()` 重应用 + `EditorComponent` 可选 setter + 扩展替换编辑器时复制 + `/settings` 面板回调。同步点共 4 处，各有独立必要路径（构造初值 / rebind / `setCustomEditorComponent` 不经过 applyRuntimeSettings / 面板即时生效），**不要**为了减点数去改上游函数结构。
4. **产物同步**。`schemas/settings.schema.json` 由 `npm run generate:schemas` 生成，改 schema 源后必须重新生成（main 上曾遗漏，导致编辑器 `$schema` 校验不认这个字段）。
5. **有意取舍**：不写 `CHANGELOG.md`（上游高频改动文件，fork 本地条目每次合并都要手动解冲突）。

## 范围边界（本分支**不**包含）

以下本地内容仍在 `main` 分支，未带入本分支：

- `packages/ai/src/utils/retry.ts` 的裸 `"temporarily unavailable"` 重试模式（v1.4.0 已收录 `"stream was interrupted"`、`"http/2 stream failed"`；状态码边界修复 `(?<![a-z0-9])429|...` 应采用上游版本，勿搬本地旧裸码）
- `LOCAL_DEV_MACOS.md`、`README.local.md`
- `package.json` build 顺序调整、删除 `check:model-catalog-compat`

## 下次升级流程（核心思想：**不搬补丁，重新实现**）

1. **拉干净上游**：
   ```bash
   git fetch upstream --tags
   git worktree add ~/project/pi-vX.Y.Z-local -b vX.Y.Z-local vX.Y.Z
   cd ~/project/pi-vX.Y.Z-local && npm ci
   npm --prefix packages/ai run generate-models   # 生成 providers/data（gitignore，ci 不产出，测试会缺模块）
   ```
2. **对照旧实现，重读新上游**。先看这个提交改过什么、上游新版本有没有动到：
   - `packages/tui/src/components/editor.ts` 的 `cursorUp`/`cursorDown` 段与 `navigateHistory`
   - `applyRuntimeSettings` / `setCustomEditorComponent` / settings 面板的条目插入方式
   - 上游是否已实现同等功能（`git grep -i 'historyCursor\|cursorFirst'`）或引入新的相关设置
3. **以新代码最好的方式重新实现**，而不是机械 apply 旧 diff。旧分支只当作行为规格（见第一节的等价表）与测试来源。可以借鉴的提取方式：
   ```bash
   git diff v1.4.0 v1.4.0-local -- <files> > /tmp/cursor-first.patch && git apply -3 /tmp/cursor-first.patch
   ```
   但 apply 后必须重新审视每一处：谓词逻辑是否仍成立、面板插入点（splice 链）是否变化、`SETTINGS_DEFAULTS` 位置、schema 与生成产物。
4. **验证清单**（全部通过后再提交，pre-commit 会再跑一遍全家桶）：
   ```bash
   cd packages/tui && node --test test/*.test.ts            # 含上游 #5789 回归用例
   cd ../coding-agent && npx vitest run test/settings-manager.test.ts test/settings-selector.test.ts
   npx tsc -p tsconfig.build.json --noEmit                  # tui 与 coding-agent 各一次
   npx biome check --write <改动文件>
   npm run generate:schemas                                 # 确认 settings.schema.json 无 diff
   # 冒烟：PI_CODING_AGENT_DIR=<临时目录> node --import <resolver> packages/coding-agent/src/cli.ts --version
   ```
5. **提交单 commit**（feat(tui,coding-agent): cursor-first prompt history navigation），工作树保持干净，本文件随分支走。
6. **更新本文档**：凡是实现方式或思想上有改进（新的收敛点、上游合并了相关功能使本补丁归零、发现更好的接线方式），在下面「改进记录」追加一条并修订正文相应段落。

## 从零设置（全新 Mac）

前置：Homebrew、Git、Node ≥ 22.19；克隆仓库并配好 remote（`origin` 为自己 fork，`upstream` 为 `earendil-works/pi`）。详见 `main` 分支上的 `LOCAL_DEV_MACOS.md`。

1. 建配置目录（首次）并检出本分支：
   ```bash
   mkdir -p ~/Documents/pi_config
   git -C ~/project/pi fetch upstream --tags
   git -C ~/project/pi worktree add ~/project/pi-v1.4.0-local -b v1.4.0-local v1.4.0   # 已存在则跳过
   cd ~/project/pi-v1.4.0-local && npm ci && npm --prefix packages/ai run generate-models
   ```
2. 在 `~/.zshrc` 写入（全新机器的最小完整版）：
   ```zsh
   # pi 配置统一放自定义目录（不碰默认 ~/.pi/agent）
   export PI_CODING_AGENT_DIR="$HOME/Documents/pi_config"
   export PI_ASK_USER_DISPLAY_MODE=inline

   # 当前使用版本：worktree 源码直跑（改代码立即生效，无需构建）
   pi() {
     PI_CODING_AGENT_DIR="$HOME/Documents/pi_config" \
       "$HOME/project/pi-v1.4.0-local/pi-test.sh" "$@"
   }

   # 回退：主 worktree（main 分支）
   pi-main() {
     PI_CODING_AGENT_DIR="$HOME/Documents/pi_config" \
       "$HOME/project/pi/pi-test.sh" "$@"
   }
   ```
3. `source ~/.zshrc`（或新开终端），验证：
   ```bash
   type pi && pi --version        # 期望输出 1.4.0
   ```

说明：`pi-test.sh` 被 git 跟踪且保留可执行位，worktree 检出即可用；函数内重复传 `PI_CODING_AGENT_DIR` 是为了显式覆盖，防止外部环境变量漂移。

## 升级后更新 ~/.zshrc

每次按「下次升级流程」建好新 worktree（如 `~/project/pi-v1.5.0-local`）并验证通过后：

1. 把 `pi()` 里的路径改成新 worktree 的 `pi-test.sh`（只改这一处路径）；
2. 旧版本要么删掉它的函数，要么把旧 worktree 的函数重命名保留一个版本作回退（`pi-main` 指向 `~/project/pi` 是固定习惯，中间版本不必都留）；
3. 清理不再需要的旧 worktree（确认无未合并改动后）：
   ```bash
   git -C ~/project/pi worktree remove ~/project/pi-v1.4.0-local
   git -C ~/project/pi branch -d v1.4.0-local   # 可选
   ```
4. `source ~/.zshrc` 或新开终端，`pi --version` 确认新版本号。

注意：正在运行的 pi 会话不会受 `~/.zshrc` 修改影响，它继续用启动时那棵树；重启 pi 才切到新版本。回退同理。

## 改进记录

- **2026-10-26（v1.4.0 重实现，相对 main 上的旧实现）**：
  - 判定逻辑从两段内联条件抽为 `shouldSwitchHistory()` 谓词，两方向语义一致、可穷举验证；
  - 默认值收敛到 `SETTINGS_DEFAULTS` 单一来源（旧版三处各写一份）；
  - 补齐 `schemas/settings.schema.json` 再生成（旧版遗漏）；
  - 面板条目移到编辑器设置区（`editor-padding` 之后）并补 description；
  - tui JSDoc 去掉对 coding-agent 内部常量的引用；
  - 删除重复的 suite reload 测试（已被 settings-manager round-trip 覆盖）。
- **未做、供后续参考**：
  - 上游化：以策略钩子形态（`ctx.ui.addHistoryNavigationPolicy`，对称于 `addAutocompleteProvider`）提 PR 的接受度高于布尔开关；上游若合并，本补丁可整体删除，仅在 `SETTINGS_DEFAULTS` 保留默认值。
  - 扩展接口（`ctx.ui.setHistoryCursorFirst`，约 6 行）等真有第二个消费者再加。
