# COA 沙盒外部命令(CLI)注入方案

> 让对话里 AI 跑技能时,sandbox 内有 `fires-cli`/`afsim-cli` 可用。
> 详细版见 [`coa-sandbox-改造.md`](./coa-sandbox-改造.md)。

## 需求

blade-agent v0.5.16 生产强制 Docker sandbox,技能 bash 在每会话独立 spawn 的 sandbox 里跑;但 **base 沙盒镜像不带 CLI、宿主工具也不挂进沙盒** → 技能断在 `fires-cli: command not found`。要把 coa 的 CLI 送进每个 sandbox。

## 旧方案(已弃)：定制镜像 — 缺点

烘 `coa-sandbox` 镜像(base + shim),`SANDBOX_IMAGE` 指它。缺点:
- 要改盒子**共享** blade-agent 的 `SANDBOX_IMAGE`、分发 8.6G 镜像,**侵入盒子**;
- coa 私货焊进所有方案共用的镜像,**耦合**;
- 单独部署用定制镜像、盒子用 base,**两套逻辑**。

## 最终方案：solution init-copy

**CLI 不进镜像,跟着 solution 走**。沙盒用官方 **base 镜像**;shim 内置在 solution 里,**会话创建时由角色 `init/run.sh` 拷进沙盒 PATH**。单独部署与盒子同一套逻辑,盒子集成只需丢 solution 目录、零改动。

### 链路

```
对话发指令 → blade-agent spawn base 沙盒(本来没 CLI)
         → 跑 roles/aoc/init/run.sh: cp $SOLUTION_DIR/bin/{fires,afsim}-cli → /usr/local/bin
         → 沙盒有了 CLI(自带默认 URL)
         → 技能 bash 调 fires-cli → host.docker.internal:3200 → coa-service /cli → 真实数据
```

### 四个组成件

| # | 件 | 说明 |
|---|---|---|
| ① | shim 自带默认 URL | `tools/fires-cli-shim/fires-cli`(默认 `:3200`)、`afsim-cli`(默认 `:8765`);env 可覆盖。因沙盒 env 只透传 proxy,不能指望注入 |
| ② | shim 内置进角色 | `scripts/bundle_solution_clis.py` 同步 shim 进 `roles/aoc/bin/`(`--check` 防漂移)。**仅 AOC 角色**(主用席位) |
| ③ | 角色 init | `roles/aoc/init/run.sh`:`cp $SOLUTION_DIR/bin/* → /usr/local/bin`(`set -e`,失败即会话创建失败) |
| ④ | compose 接线 | `SANDBOX_IMAGE`=base;`BLADE_AGENT_HOST_DIR`=workspace 父目录;删 coa-sandbox 镜像构建 |

### 验证

浏览器端到端:AOC 对话「创建会话」→ base 沙盒装入两 CLI → `fires-cli oplan list` → `/cli 200` → 真实 OPLAN 数据回到对话。

## 注意点

1. **shim 必须在 `roles/<role>/bin/`**：init 只 stage 角色目录,不是整个 solution;放 solution 根 `tools/` 不会被 stage → 会话 500。
2. **`BLADE_AGENT_HOST_DIR` = workspace 的父目录**,挂载源字面 `<父>/workspace`；设成 workspace 本身会多算一层 → 沙盒挂载失败。`.env` 给绝对路径。
3. **沙盒 env 只透传 proxy** → shim 必须自带默认 URL。
4. **shim 必须 LF**：`.gitattributes` 已强制;CRLF 会让 shebang 变 `bad interpreter`。
5. **改 canonical shim 后重跑 bundle**：`python scripts/bundle_solution_clis.py`,`--check` 守漂移。
6. **afsim-cli 无通用默认**：连每部署不同的 Windows daemon,纯 Linux box 上调用会报 unreachable(待修)。
7. **扩角色**：给该角色加 `bin/` + `init/run.sh` 即可,不动镜像、不动 blade-agent。
