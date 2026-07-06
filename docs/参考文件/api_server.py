"""
Blade Agent 文件处理 API 服务
提供文件上传、Agent 识别、结果存储的完整流程
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os
import sqlite3
import subprocess
import uuid
from datetime import datetime
from pathlib import Path

app = FastAPI(title="Blade Agent File Processing API")

# 配置
UPLOAD_DIR = Path("./uploads")
DB_PATH = "./blade_files.db"
UPLOAD_DIR.mkdir(exist_ok=True)

# 初始化数据库
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id TEXT UNIQUE,
            original_name TEXT,
            file_path TEXT,
            file_size INTEGER,
            file_type TEXT,
            upload_time DATETIME,
            status TEXT DEFAULT 'pending',
            result TEXT,
            error TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    文件上传接口
    - 接收文件
    - 保存到本地
    - 记录到数据库
    - 返回 file_id
    """
    try:
        # 生成唯一文件 ID
        file_id = str(uuid.uuid4())
        
        # 保存文件
        file_extension = Path(file.filename).suffix
        saved_path = UPLOAD_DIR / f"{file_id}{file_extension}"
        
        content = await file.read()
        with open(saved_path, "wb") as f:
            f.write(content)
        
        # 记录到数据库
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO files (file_id, original_name, file_path, file_size, file_type, upload_time)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            file_id,
            file.filename,
            str(saved_path),
            len(content),
            file.content_type or "unknown",
            datetime.now().isoformat()
        ))
        conn.commit()
        conn.close()
        
        return JSONResponse({
            "success": True,
            "file_id": file_id,
            "message": f"文件上传成功，已保存至 {saved_path}"
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process/{file_id}")
async def process_file(file_id: str, prompt: str = "请识别并处理这个文件"):
    """
    触发 Blade Agent 处理文件
    - 从数据库获取文件信息
    - 调用 Blade CLI 或 API
    - 保存处理结果
    """
    # 查询文件信息
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM files WHERE file_id = ?', (file_id,))
    file_record = cursor.fetchone()
    
    if not file_record:
        conn.close()
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 更新状态为 processing
    cursor.execute('UPDATE files SET status = ? WHERE file_id = ?', ('processing', file_id))
    conn.commit()
    
    file_path = file_record[4]  # file_path 列
    
    try:
        # 方式 1: 通过 Blade CLI 调用（适合本地开发）
        # 构建指令
        command = f'blade run "文件处理" "{prompt}: {file_path}"'
        
        # 执行命令（超时 120 秒）
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode == 0:
            # 更新数据库为成功状态
            cursor.execute(
                'UPDATE files SET status = ?, result = ? WHERE file_id = ?',
                ('completed', result.stdout, file_id)
            )
            conn.commit()
            conn.close()
            
            return JSONResponse({
                "success": True,
                "file_id": file_id,
                "result": result.stdout
            })
        else:
            # 更新数据库为失败状态
            cursor.execute(
                'UPDATE files SET status = ?, error = ? WHERE file_id = ?',
                ('failed', result.stderr, file_id)
            )
            conn.commit()
            conn.close()
            
            raise HTTPException(status_code=500, detail=result.stderr)
            
    except subprocess.TimeoutExpired:
        cursor.execute(
            'UPDATE files SET status = ?, error = ? WHERE file_id = ?',
            ('failed', '处理超时', file_id)
        )
        conn.commit()
        conn.close()
        raise HTTPException(status_code=500, detail="处理超时")
        
    except Exception as e:
        cursor.execute(
            'UPDATE files SET status = ?, error = ? WHERE file_id = ?',
            ('failed', str(e), file_id)
        )
        conn.commit()
        conn.close()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/result/{file_id}")
async def get_result(file_id: str):
    """
    查询文件处理结果
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM files WHERE file_id = ?', (file_id,))
    file_record = cursor.fetchone()
    conn.close()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return JSONResponse({
        "file_id": file_record[2],
        "original_name": file_record[3],
        "status": file_record[8],
        "result": file_record[9],
        "error": file_record[10],
        "upload_time": file_record[7]
    })


@app.get("/files")
async def list_files():
    """
    列出所有已上传的文件
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT file_id, original_name, file_type, upload_time, status FROM files ORDER BY upload_time DESC')
    files = cursor.fetchall()
    conn.close()
    
    return JSONResponse({
        "files": [
            {
                "file_id": f[0],
                "original_name": f[1],
                "file_type": f[2],
                "upload_time": f[3],
                "status": f[4]
            }
            for f in files
        ]
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
