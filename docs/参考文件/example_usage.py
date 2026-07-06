"""
Blade Agent 文件处理 API 使用示例
演示如何上传文件、触发处理、查询结果
"""

import requests
import time

# API 基础地址
BASE_URL = "http://localhost:8000"

def upload_and_process(file_path: str, prompt: str = "请识别并处理这个文件"):
    """
    完整的文件上传和处理流程
    """
    # 1. 上传文件
    print(f"正在上传文件：{file_path}")
    with open(file_path, "rb") as f:
        files = {"file": f}
        response = requests.post(f"{BASE_URL}/upload", files=files)
    
    if response.status_code != 200:
        print(f"上传失败：{response.text}")
        return None
    
    result = response.json()
    file_id = result["file_id"]
    print(f"上传成功，file_id: {file_id}")
    
    # 2. 触发处理
    print("正在触发 Blade Agent 处理...")
    response = requests.post(
        f"{BASE_URL}/process/{file_id}",
        params={"prompt": prompt}
    )
    
    if response.status_code == 200:
        print("处理完成!")
        print(f"结果：{response.json()['result']}")
    else:
        print(f"处理失败：{response.text}")
    
    # 3. 查询结果（异步场景）
    print("\n查询最终状态:")
    response = requests.get(f"{BASE_URL}/result/{file_id}")
    print(response.json())
    
    return file_id

def list_all_files():
    """
    列出所有已上传的文件
    """
    response = requests.get(f"{BASE_URL}/files")
    if response.status_code == 200:
        print("\n已上传的文件列表:")
        for f in response.json()["files"]:
            print(f"  - {f['original_name']} ({f['file_id']}) - 状态：{f['status']}")
    else:
        print(f"查询失败：{response.text}")

if __name__ == "__main__":
    # 示例 1: 上传并处理一个文件
    # 请替换为你的实际文件路径
    test_file = "./test_document.pdf"  # 替换为实际文件
    
    if __import__("pathlib").Path(test_file).exists():
        upload_and_process(
            test_file,
            prompt="请识别这个文件的内容，提取关键信息，并将结果保存到数据库"
        )
    else:
        print(f"测试文件不存在：{test_file}")
        print("请先创建一个测试文件，或修改 test_file 变量指向实际文件")
    
    # 示例 2: 列出所有文件
    list_all_files()
