# Blade AI 与本地数据库集成指南

## 架构说明

### 问题
Blade AI 服务运行在远程服务器上，**无法直接访问**你本地的数据库。

### 解决方案
通过**后端 API 作为中介**，实现数据流转：

```
┌──────────────┐      调用技能       ┌──────────────┐
│  前端/用户    │ ─────────────────→ │  Blade AI    │
└──────────────┘                     │  (远程服务)   │
      │                               └──────────────┘
      │                                    │
      │  1. 调用后端 API                    │ 2. 返回结果
      │ ─────────────────────────────────→│
      │                                    │
      ▼                                    ▼
┌─────────────────────────────────────────────────┐
│              本地后端 (FastAPI)                  │
│  - 接收 Blade AI 返回的数据                      │
│  - 保存到本地 MySQL 数据库                        │
│  - 提供数据查询接口                              │
└─────────────────────────────────────────────────┘
      │
      ▼
┌──────────────┐
│ 本地 MySQL    │
│ 数据库        │
└──────────────┘
```

---

## 已实现的功能

### 1. Blade AI 技能调用接口

**端点**: `POST /api/blade/call`

**功能**: 调用任意 Blade AI 技能

**请求示例**:
```bash
curl -X POST http://localhost:8000/api/blade/call \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "BladeAI/ppt-sheng-cheng-yu-bian-ji",
    "prompt": "根据这份文档生成演示文稿",
    "params": {
      "input_file": "document.docx"
    }
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "output_file": "presentation.pptx",
    "download_url": "http://..."
  }
}
```

---

### 2. 通用数据保存接口

**端点**: `POST /api/blade/save-data`

**功能**: 将 Blade AI 生成的数据保存到本地数据库

**请求示例**:
```bash
curl -X POST http://localhost:8000/api/blade/save-data \
  -H "Content-Type: application/json" \
  -d '{
    "data_type": "analysis_result",
    "content": {
      "target": "航母编队",
      "threat_level": "高",
      "recommendation": "建议采取防御阵型"
    },
    "metadata": {
      "skill_used": "BladeAI/hang-mu-bian-dui-fang-kong-fan-dao-zhen-xing-you-hua",
      "confidence": 0.92
    }
  }'
```

**响应示例**:
```json
{
  "success": true,
  "record_id": 123
}
```

---

### 3. 分析结果专用接口

**端点**: `POST /api/blade/save-analysis`

**功能**: 专门用于保存分析、预测、评估类结果

**请求示例**:
```bash
curl -X POST http://localhost:8000/api/blade/save-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "analysis_type": "threat_assessment",
    "target_info": {
      "name": "目标 A",
      "type": "舰船",
      "location": {"lat": 30.5, "lon": 122.3}
    },
    "result": {
      "threat_level": "高",
      "capabilities": ["反舰导弹", "防空系统"],
      "estimated_strength": "中等"
    },
    "confidence": 0.85
  }'
```

---

### 4. 数据查询接口

**端点**: `GET /api/blade/data/{data_type}`

**功能**: 按类型查询保存的数据

**请求示例**:
```bash
curl "http://localhost:8000/api/blade/data/analysis_threat_assessment?limit=10"
```

**响应示例**:
```json
{
  "count": 5,
  "data": [
    {
      "id": 125,
      "data_type": "analysis_threat_assessment",
      "content": {...},
      "metadata": {...},
      "created_at": "2026-06-25T10:30:00Z"
    }
  ]
}
```

---

## 完整工作流示例

### 场景：使用 Blade AI 进行威胁评估并保存结果

#### 步骤 1: 前端调用后端触发 Blade AI

```javascript
// 前端代码示例
async function runThreatAssessment(targetData) {
  // 1. 调用后端 API，触发 Blade AI 技能
  const response = await fetch('http://localhost:8000/api/blade/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skill_id: 'BladeAI/hui-shang-ping-gu',
      prompt: '评估目标威胁等级',
      params: {
        target_info: targetData
      }
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    // 2. 后端已自动保存结果到数据库
    console.log('分析完成，结果已保存');
    
    // 3. 可选：从数据库获取保存的数据
    const savedData = await fetch(
      `http://localhost:8000/api/blade/data/analysis_threat_assessment`
    ).then(r => r.json());
    
    return {
      analysis: result.data,
      saved_records: savedData
    };
  }
}
```

#### 步骤 2: 后端处理流程

```
用户请求 → 后端接收 → 调用 Blade AI → 获取结果 → 保存到数据库 → 返回结果
```

后端自动完成：
1. 调用远程 Blade AI 服务
2. 接收返回的分析结果
3. 将结果保存到本地 MySQL 的 `blade_data` 表
4. 返回成功响应

#### 步骤 3: 数据已保存到本地数据库

```sql
-- 查看保存的数据
SELECT * FROM blade_data WHERE data_type LIKE 'analysis_%' ORDER BY created_at DESC;

-- 查看特定类型的分析结果
SELECT id, content, created_at 
FROM blade_data 
WHERE data_type = 'analysis_threat_assessment';
```

---

## 数据库表结构

### `blade_data` 表

```sql
CREATE TABLE blade_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    data_type VARCHAR(50) NOT NULL,        -- 数据类型标识
    content JSON NOT NULL,                  -- 核心数据内容
    metadata JSON,                          -- 附加元数据
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_data_type (data_type),
    INDEX idx_created_at (created_at)
);
```

**字段说明**:
- `data_type`: 数据类型，如 `analysis_threat_assessment`, `report_summary`, `plan_details`
- `content`: JSON 格式的核心数据
- `metadata`: JSON 格式的元数据（来源、置信度、时间戳等）

---

## 环境变量配置

在 `backend/.env` 中添加：

```env
# Blade API 配置
BLADE_API_BASE=http://127.0.0.1:8020
BLADE_TOKEN=sk-blade-v2-xxx  # 你的 Blade API Token

# 数据库配置（已有）
SMART_DATABASE_URL=mysql+pymysql://root:root@localhost:3306/smart
```

---

## 自定义数据类型

如果需要保存特定类型的数据，可以扩展后端代码：

### 1. 创建新的数据模型

```python
# backend/app/blade_integration.py

class CustomDataRequest(BaseModel):
    field1: str
    field2: int
    field3: Dict[str, Any]

@router.post("/save-custom")
async def save_custom_data(request: CustomDataRequest):
    return await save_data(
        request=DataSaveRequest(
            data_type="custom_type",
            content=request.dict(),
            metadata={"source": "custom_api"}
        )
    )
```

### 2. 创建专用表（可选）

如果需要更结构化的存储，可以创建专用表：

```python
# 在 db.py 中添加
class BladeAnalysis(SQLModel, table=True):
    __tablename__ = "blade_analysis"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    analysis_type: str
    target_json: str  # JSON 字符串
    result_json: str
    confidence: Optional[float]
    created_at: datetime = Field(default_factory=datetime.now)
```

---

## 安全考虑

### 1. API 认证

当前接口**未设置认证**，适合本地开发。生产环境建议：

```python
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    if credentials.credentials != os.getenv("API_KEY"):
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/save-data", dependencies=[Security(verify_token)])
async def save_data(...):
    ...
```

### 2. 输入验证

所有输入数据已通过 Pydantic 模型验证，防止恶意数据。

### 3. SQL 注入防护

使用参数化查询，防止 SQL 注入。

---

## 测试接口

### 1. 测试技能调用

```bash
curl -X POST http://localhost:8000/api/blade/call \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "BladeAI/ppt-sheng-cheng-yu-bian-ji",
    "prompt": "测试技能调用"
  }'
```

### 2. 测试数据保存

```bash
curl -X POST http://localhost:8000/api/blade/save-data \
  -H "Content-Type: application/json" \
  -d '{
    "data_type": "test_data",
    "content": {"message": "Hello, Blade AI!"},
    "metadata": {"test": true}
  }'
```

### 3. 测试数据查询

```bash
curl http://localhost:8000/api/blade/data/test_data
```

### 4. 使用 Swagger UI

访问 http://localhost:8000/docs，在网页中直接测试所有接口。

---

## 常见问题

### Q1: Blade AI 返回的数据格式不统一怎么办？

A: 在保存前进行标准化处理：

```python
@router.post("/save-blade-result")
async def save_blade_result(raw_data: Dict[str, Any]):
    # 标准化处理
    standardized = {
        "source": raw_data.get("skill_id"),
        "timestamp": datetime.now().isoformat(),
        "data": raw_data.get("result", raw_data)
    }
    
    return await save_data(
        request=DataSaveRequest(
            data_type=f"blade_{raw_data.get('skill_type', 'unknown')}",
            content=standardized
        )
    )
```

### Q2: 如何区分不同类型的 Blade AI 数据？

A: 使用 `data_type` 字段进行区分：
- `analysis_threat_assessment` - 威胁评估
- `analysis_position_prediction` - 位置预测
- `report_summary` - 报告摘要
- `plan_details` - 方案详情

### Q3: 数据量大了怎么办？

A: 可以添加分页和归档机制：

```python
@router.get("/data/{data_type}")
async def get_data_by_type(
    data_type: str, 
    limit: int = 100, 
    offset: int = 0
):
    # 添加分页
    ...
```

---

## 下一步

1. **测试所有接口**：确保本地后端能正常调用 Blade AI 并保存数据
2. **添加业务逻辑**：根据实际需求扩展数据类型和处理逻辑
3. **前端集成**：在前端调用这些接口，实现完整工作流
4. **安全加固**：生产环境添加认证、限流、日志等
5. **性能优化**：添加缓存、索引、分区等

---

## 技术支持

- **接口文档**: http://localhost:8000/docs
- **数据库查看**: `mysql -uroot -proot smart -e "SELECT * FROM blade_data;"`
- **日志**: `docker-compose logs backend`
