---
name: save-material-doc
display_name: 上传申请材料到审查
description: 当用户在聊天中通过"+"上传申请书/申报材料并表达"这是待审查的申请材料/上传申请材料/加入审查材料"时，把该文件存入立项审查的审查包并识别。
---

# save-material-doc — 上传申请材料到审查包

本技能随会话下发一个纯标准库脚本 `scripts/smart_doc_material.py`，它把 sandbox 里的文件
multipart 上传到立项审查后端的 `POST /api/material-files` 完成入审查包，并轮询
`GET /api/material-packages` 等待文档识别完成。后端地址在同目录的
`scripts/api_base.txt`（由前端注入）。

## 何时触发
用户在聊天中**已用"+"上传了一个文件**（文件已在当前 session 的 sandbox 中），并表达把它
存为待审查申请材料的意图，例如："这是待审查的申请材料""上传申请书审查""加入审查材料"。

## 前置判断
1. 确认 sandbox 中确有用户刚上传的文件，拿到它的**绝对路径**。
2. 判断它是否为**申请材料类文档**（申请书、申报书、可行性报告等）。明显不是则先说明并询问，不擅自入包；意图不明先澄清。

## 执行
对确认要保存的文件，用 Bash 工具运行：

```bash
# 1) 定位随本技能下发的脚本
SCRIPT="$(find / -path '*save-material-doc/scripts/smart_doc_material.py' 2>/dev/null | head -1)"
# 2) 读取后端地址（前端注入到脚本同目录的 api_base.txt）；tr 去掉可能的 CR/LF
API="$(cat "$(dirname "$SCRIPT")/api_base.txt" | tr -d '\r\n')"
KEY="$(cat "$(dirname "$SCRIPT")/api_key.txt" 2>/dev/null | tr -d '\r\n')"
# 3) 上传入审查包（每个文件绝对路径作为一个参数，可多个）
# 同一份申请的后续文件可带 --package <上一次返回的 package_id> 归入同包
SMART_DOC_API="$API" SMART_DOC_API_KEY="$KEY" python3 "$SCRIPT" "<sandbox 中的文件绝对路径>"
```

> 若 `find` 没找到脚本，如实告知"技能脚本缺失，无法上传"，不要伪造结果。

## 解读结果（按退出码）
| 退出码 | 含义 | 你应如何回报 |
|---|---|---|
| 0 | 全部成功 | 报告每个文件的编号，例："已存入审查包：申请书（material_file_id=7，package_id=3），已识别 12 段" |
| 1 | 用法错误（没给文件参数） | 说明没有可保存的文件 |
| 2 | 文件不存在/不可读 | 说明没找到文件，请用户确认是否已上传 |
| 3 | 连不上后端 | 说明后端暂时不可达（可能隧道未开/地址错），建议稍后重试 |
| 4 | 后端返回错误（非 2xx） | 说明入包失败（附 stderr 原因），不要声称成功 |
| 5 | 部分/全部文件失败 | 逐个报告：成功的报 material_file_id+package_id，失败的报 stderr 里的原因 |
| 6 | 后端地址未配置 | 部署问题：`api_base.txt` 为空，提示需在前端配 `VITE_SMART_DOC_API` |

## 识别摘要（stdout 的 recognition= 行）
入包成功后脚本多打印一行 `recognition=<状态> segments=<段数>`：
- `recognition=done`：在成功回报后补一句「已识别 <段数> 段」。
- `recognition=failed`：照实说「已入包，但自动识别失败，可在材料页点『重新识别』重试」。不要把识别失败说成入包失败——文件已入包。
- 没有该行（旧后端）：照原样回报，不要编造识别结果。

## 续传同包
若用户同一次申请要上传多个文件，把第一次返回的 `package_id` 作为 `--package` 参数传给后续调用：
```bash
SMART_DOC_API="$API" SMART_DOC_API_KEY="$KEY" python3 "$SCRIPT" --package <package_id> "<第二个文件路径>"
```

## 铁律
- **只有退出码 0 且 stdout 出现 `material_file_id=` 才能说"已保存成功"。** 其他情况一律如实说明失败原因，绝不谎报。
- 不要凭空编造 `material_file_id` 或 `package_id`——只转述脚本的实际输出。
- 不得绕过本脚本直连数据库或自行拼 SQL；所有入包一律走该脚本（它内部调后端的带校验接口）。
