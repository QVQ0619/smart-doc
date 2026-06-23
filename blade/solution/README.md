# 立项审查工作台 — Blade Solution 包

把 smart-doc 做成 Blade **原生 Solution 工作台**(A 方案)的脚手架。

## 结构

```
blade/solution/
├── project_review/            # 配置源(git 跟踪)
│   ├── solution.yaml          # Solution 级：layout=blade-coa、roles、preview
│   └── roles/
│       ├── rule_doc_saver/role.yaml      # 规则入库员  → save-rule-doc
│       ├── rule_extractor/role.yaml      # 规则抽取师  → extract-review-rules
│       └── rule_structurer/role.yaml     # 规则结构化师 → structure-review-rules
├── build.mjs                  # 构建器：组装 SKILL.md + shim + key → dist/
└── dist/                      # 产物(gitignore)，可 zip 上传
```

**为什么 git 里没有 `skills/`**：SKILL.md 的唯一来源是 `blade/skills/<name>/`，shim 唯一来源是
`backend/agent_shim/`。`build.mjs` 打包时从这两处拷贝组装，避免一份配置维护两遍而漂移。

## 后端地址 / 密钥怎么进沙箱

`build.mjs` 把后端地址和密钥写进每个 skill 的 `scripts/api_base.txt`、`api_key.txt`(随技能同步进沙箱)，
SKILL.md 的执行步骤 `cat` 它们并传给 shim(`SMART_DOC_API` / `SMART_DOC_API_KEY`)。
**不依赖平台是否透传环境变量**(blade-coa 项目验证过的稳妥路线)。

## 打包 + 上传

```bash
# 1) 组装(从部署环境变量取地址/密钥写进资源文件)
SMART_DOC_API=https://你的隧道域名 SMART_DOC_API_KEY=你的密钥 node blade/solution/build.mjs

# 2) 打 zip(PowerShell)
Compress-Archive -Path blade/solution/dist/project_review -DestinationPath blade/solution/dist/project_review.zip -Force

# 3) 上传到 8020/studio/skill-editor(上传即自动校验目录结构/字段)
```

地址或密钥变了(如隧道重建)→ 重跑 build + 重新上传。

## 与现有的关系

- **后端零改**：继续当持久化层 + 真相源(skill 经 HTTP 调它，前端规则库经 GET 取数)。
- **前端不扔**：`solution.yaml` 的 `preview.url=${SMART_DOC_WEB}/standard-docs` 把现有 React 规则库
  嵌进工作台预览面板(用户浏览器加载)。
- 走 Solution 后，集成模式的 `src/blade/sessionSkill.ts`(每会话推 skill)可由声明式 Solution 取代。

## 待 POC(在公司 Blade 上验一次)

- `preview.url` 的 `${SMART_DOC_WEB}` 平台 env 展开是否生效(兜底=写死前端地址)。
- 沙箱→后端可达(隧道/内网)——当前用 cloudflared，长期建议 named tunnel 或内网部署。
