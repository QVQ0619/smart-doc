# blade-agent 加载并选中 skill 的实现逻辑

> 最后更新:2026-06-18
> 权威源:`scripts/bundle_solution_skills.py` · `solutions/blade_coa/solution.yaml` · `solutions/blade_coa/roles/<id>/role.yaml` · `docker-compose.yml`(blade-agent service) · `skills/README.md`
> 相关规约:[`CLAUDE.md`](../CLAUDE.md) 第六章(schema 纪律)/ 第七章(skills×CLI×GIS)· [`docs/integration.md`](./integration.md) §3

---

## 0. 边界声明(先读)

blade-agent 是**预构建镜像**(`blade-agent:v0.4.x`,非本仓代码,非 submodule)。因此:

- **本仓可见**:skill 文件结构、打包脚本(`bundle_solution_skills.py`)、solution/role 清单、docker-compose 挂载与环境变量。
- **镜像内部(不可见,仅有契约)**:`SolutionRegistry.scan_builtin()`、`sync_solution_skills()`、skill→LLM tool 暴露的精确源码在镜像内。本文据打包脚本 docstring + 挂载配置 + solution/role 清单**推断其行为**,并在相应处标注「镜像内行为」。

> 改 skill 加载逻辑时:**只能改本仓侧**(skills/ 源 + bundle 脚本 + solution/role 清单 + 挂载),**严禁**改 blade-agent 容器内文件(不可变镜像,升级走 build/部署链路)。

---

## 1. 核心前提:两条加载通道,当前只用第二条

`scripts/bundle_solution_skills.py` 的 docstring 明确记录了这个决策:

| 通道 | 路径 | 状态 |
|---|---|---|
| **A. imported_skills** | 从 in-process SkillRegistry / 独立 `skill-registry`(8010,jieba+BM25)拉技能 | ❌ **已弃用** |
| **B. solution 私有技能** | blade-agent `sync_solution_skills` 扫描 `<solution>/skills/**/SKILL.md` 拷进会话 | ✅ **当前在用** |

### 历史坑(为什么弃用通道 A)

端到端测试发现:走通道 A 时会话"已安装 0 个技能",agent 找不到 `wing_*` 技能 → **改去手工探索 + 写文件,F 屏不落库**。

**决策**:把 skill **内置**进 solution,使其完全自包含,不再依赖 skill-registry。落地标志:

- `solution.yaml` 与所有 `role.yaml` 的 `imported_skills: []`(空);
- skill-registry(8010)仍运行、可单独打开查看,但 **agent 不再从它取技能**。

> ⚠️ **不要误以为「8010 能看到 = agent 就能用」**。两者已解耦。

---

## 2. 加载(Load)实现逻辑 —— 四个阶段

```
① 打包(build / 部署前 · 本仓脚本)
   skills/<cat>/<name>/versions/<最新版>/   ──bundle_solution_skills.py──▶
   solutions/blade_coa/skills/<name>/        （扁平化整目录拷贝）
        │
② 挂载(docker-compose volumes)
   ./solutions/blade_coa  →  容器 .../solutions/builtin/blade_coa   (ro)   ← 通道 B 源
   ./skills               →  /app/agent_env/coa_skills              (ro)   ← 仅供可选语义搜索/afsim
        │
③ 启动(blade-agent 镜像内 · 契约)
   SolutionRegistry.scan_builtin()   发现 blade_coa solution
   sync_solution_skills()            扫 <solution>/skills/**/SKILL.md → 拷进会话为「私有技能」
        │
④ 暴露(solution.yaml: skill_tools_enabled: true)
   每个可见 skill 成为 LLM 可调用的工具
```

### ① 打包阶段(`scripts/bundle_solution_skills.py`,本仓核心实现)

- **`BUNDLED_SKILLS`**:内置技能白名单。当前 **6 类共 39 项**:
  - A_session(3):`enter_planning_session` / `resume_oplan` / `view_planning_overview`
  - A_context(4):`setup_oplan` / `define_phase` / `define_loe` / `draft_contingency`
  - F_wing(5):`wing_receipt` / `wing_analysis` / `wing_threat` / `wing_coa` / `wing_wargame`
  - E_composite(4):`auto_plan_full` / `complete_strike_workflow` / `replay_coa_simulation` / `start_planning_for_target`
  - B_planning(14):`vet_target` / `weaponeer_target` / `evaluate_cde` / `assign_force` / `plan_mission` / `plan_ew` / `run_rehearsal` / `prioritize_jiptl` / `publish_ato` / `issue_fragord` / `record_f2t2ea` / `submit_bda_full` / `record_jtf_assessment` / `assess_combat`
  - afsim-cli(9):`01_session_init` … `09_red_blue_workflow`

  > 注:脚本第 39 行注释写「30 个」是**过时计数**,实际以 `BUNDLED_SKILLS` 元组为准(当前 39)。
- **版本选择**(`_find_source`):在 `skills/*/<name>/versions/` 下取**版本号最大**的 version 目录(按 `tuple(int…)` 排序,如 `1.1.0` > `1.0.0`)。
- **整目录拷贝**(`shutil.copytree`):每个 version 目录**自洽**(`SKILL.md` + 内联 `_shared/`+`helpers/`+`examples/`),整体拷到 `solutions/blade_coa/skills/<name>/`(扁平化,丢掉 `<cat>/versions/<v>` 层级)。
- **afsim-cli 特例**(`_category_shared`):其 SKILL.md 用 `shared/<file>.md` 引用 **category 级** `skills/afsim-cli/shared/`,打包时把该 `shared/` 一并拷进每个 afsim skill 目录,否则 runtime 引用失效。
- **校验模式**(`--check`):逐文件比对源与副本(文件集 + 字节内容),发现 drift 退出码 1;用于 CI / 提交前守门。

### ② 挂载阶段(`docker-compose.yml` blade-agent service)

| 挂载 / 环境变量 | 值 | 用途 |
|---|---|---|
| volume | `./solutions/blade_coa:/app/.../solutions/builtin/blade_coa:ro` | **通道 B 源**(主加载路径) |
| volume | `./skills:/app/agent_env/coa_skills:ro` | 仅供 in-process SkillRegistry 的**可选语义搜索 + afsim** |
| env | `BLADE_SKILL_PATHS`(10 个 category 目录,`:` 分隔) | 同上,非主加载路径 |

### ③④ 启动 + 暴露(镜像内行为)

- `SolutionRegistry.scan_builtin()` 经 `importlib.resources` 自动发现 `blade_coa` solution。
- `sync_solution_skills()` 把 `<solution>/skills/**/SKILL.md` 作为「私有技能」拷进会话。
- `solution.yaml: skill_tools_enabled: true` → 可见技能成为 LLM 可调用工具。

---

## 3. 选中(Select)实现逻辑 —— 席位过滤 + LLM 匹配

### 第一层:席位(role)白名单过滤(`role.yaml`,本仓可见)

- 前端选席位 → URL hash `#/seat/{roleId}/{route}`(见 `frontend-jp/src/components/AppMenu.tsx` / `seat/seatStore.ts`)。
- 每个席位有独立 `solutions/blade_coa/roles/<id>/role.yaml`,核心字段 **`local_skills`** = 该席位 Agent **可见的技能子集白名单**。
- 8 个席位:`aoc` / `spo` / `ewo` / `sci` / `isr` / `jfe` / `jfc` / `jtf`。
  - **`aoc`(空中作战中心 / 火力规划席主导)**:`local_skills` = 全集 **39 项**(与 `BUNDLED_SKILLS` 等量,B-1~B-8 + F-0~F-6 + AFSIM)。**前端默认席位即 `aoc`**(`AppMenu.tsx: DEFAULT_SEAT = "aoc"`)。
  - 其它席位:`local_skills` 更窄,只含本席职责相关技能。
- `role.yaml` 其它字段:`initial_mode`(开场模式)、`initial_message`(开场白)、`AGENTS.md.j2`(席位人格模板)、`init/run.sh`(席位初始化)。

### 第二层:LLM 据 frontmatter 匹配(镜像内行为)

- `skill_tools_enabled: true` 后,席位可见技能成为工具。
- LLM 据**用户意图** + 每个 `SKILL.md` frontmatter 的 **`description` / `when_to_use` 触发词**自动选中:
  ```
  用户："为美以猎狮斩首想定创建作战计划"
  LLM：[加载 setup_oplan skill] → 按 SKILL.md 流程执行
  ```
- 选中后 Agent 按 SKILL.md 的 `inputs` / 正文 `fires-cli` 命令 / `post_steps` / `decision_gates` 执行,落到数据通道(`fires-cli → /cli → service → DB → event`,见 CLAUDE.md §7)。

---

## 4. 关键文件清单

| 文件 | 角色 |
|---|---|
| `skills/<cat>/<name>/versions/<v>/SKILL.md` | **权威源**:技能操作手册(frontmatter + 正文命令) |
| `scripts/bundle_solution_skills.py` | 打包器:源 → solution 内置副本;`BUNDLED_SKILLS` 白名单;`--check` 守门 |
| `solutions/blade_coa/skills/<name>/` | **派生副本**(agent 实际加载的私有技能,勿手改) |
| `solutions/blade_coa/solution.yaml` | solution 元数据:`skill_tools_enabled` / `roles` / `imported_skills: []` |
| `solutions/blade_coa/roles/<id>/role.yaml` | 席位定义:`local_skills` 白名单 + 开场 + 人格模板 |
| `docker-compose.yml`(blade-agent) | 挂载 solution/skills + `BLADE_SKILL_PATHS` |
| `skill-registry`(8010) | 独立检索服务,**仅可视化查看,非 agent 技能源** |

---

## 5. 标准操作流程(SOP)

### 改一个已存在 skill 的内容

```bash
# 1. 改权威源
vim skills/<cat>/<name>/versions/<v>/SKILL.md
# 2. 重新打包(否则 agent 用的还是旧副本)
python scripts/bundle_solution_skills.py
# 3. 校验一致性
python scripts/bundle_solution_skills.py --check     # exit 0 = OK
```

### 新增 / 删除一个 skill(同步三处,缺一即失效)

1. 在 `skills/<cat>/<name>/versions/<v>/` 建好自洽的 SKILL.md(含内联 `_shared/`/`helpers/`/`examples/`);
2. 加进 `scripts/bundle_solution_skills.py` 的 **`BUNDLED_SKILLS`** 清单;
3. 加进**需要它的每个席位**的 `roles/<id>/role.yaml` 的 **`local_skills`**;
4. 跑 `python scripts/bundle_solution_skills.py` 重新打包;
5. （可选)更新 `solution.yaml` 注释 / 版本。

---

## 6. 注意事项(按重要度)

### A. 改 skill 后必须重新打包(最易踩)
`skills/` 是权威源,`solutions/blade_coa/skills/` 是派生副本。改源**不 bundle** → agent 用旧副本(drift)。提交前 `--check` 守门。

### B. 增删 skill 要同步三处
`BUNDLED_SKILLS`(脚本)+ `solution.yaml` + **对应 `role.yaml` 的 `local_skills`**。漏第三处 → 该席位检索不到这个 skill。

### C. 不要回退到 skill-registry / imported_skills 通道
实测「0 技能」坑;`imported_skills` 必须保持 `[]`。8010 仅作可视化。

### D. version 目录必须自洽
新建 skill 的 `versions/<v>/` 要内联依赖(整目录可独立拷贝);afsim 类记得 category `shared/`。

### E. blade-agent 是纯拉镜像
严禁改容器内文件;skill 加载只能靠「本仓 bundle + 挂载」;升级走 build/部署链路。

### F. SKILL.md frontmatter 决定「能否被选中」
`description` / `when_to_use` 缺触发词或语义模糊 → LLM 选不中 → agent 转去手工操作。文档质量直接影响功能。

### G. 选席位要选对
火力规划全流程选 `aoc`(全集);选了窄席位会看不到大量 skill。默认即 `aoc`。

### H. 数据 / schema 纪律(承接 CLAUDE.md §6/§7)
skill 内只能走 `fires-cli`,禁直连 DB / 手写 SQL / 绕过 CLI 打 HTTP;引用的表必须真实存在,否则 service `status='skipped'`。

---

## 7. 排错:agent 不调 fires-cli、改去手工写文件、数据不落库

典型根因是「技能没被加载/选中」。按顺序排查:

1. 这个 skill 在 `BUNDLED_SKILLS` 里吗?
2. bundle 跑过吗?`python scripts/bundle_solution_skills.py --check`
3. **当前席位的 `role.yaml: local_skills`** 列了吗?
4. `imported_skills` 是不是被误填了(应为 `[]`)?
5. SKILL.md 的 `when_to_use` 触发词够不够、是否匹配用户说法?
6. 席位选对了吗(全流程应为 `aoc`)?
