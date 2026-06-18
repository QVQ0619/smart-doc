import io

import pytest

from app.storage import Storage, FileTooLargeError


def test_save_writes_file_and_returns_metadata(storage_dir):
    storage = Storage(storage_dir)
    data = b"hello world"
    stored = storage.save("rule", "a.txt", io.BytesIO(data), max_bytes=1024)

    assert stored.size_bytes == len(data)
    assert stored.rel_path.startswith("rule/")
    assert stored.stored_name.endswith(".txt")
    disk = storage_dir / stored.rel_path
    assert disk.exists()
    assert disk.read_bytes() == data
    import hashlib
    assert stored.sha256 == hashlib.sha256(data).hexdigest()


def test_save_rejects_oversize_and_leaves_no_orphan(storage_dir):
    storage = Storage(storage_dir)
    with pytest.raises(FileTooLargeError):
        storage.save("rule", "big.bin", io.BytesIO(b"x" * 100), max_bytes=10)
    # 子目录可能已建，但不应残留任何文件
    rule_dir = storage_dir / "rule"
    if rule_dir.exists():
        assert list(rule_dir.iterdir()) == []


def test_delete_removes_file(storage_dir):
    storage = Storage(storage_dir)
    stored = storage.save("application", "b.txt", io.BytesIO(b"data"), max_bytes=1024)
    disk = storage_dir / stored.rel_path
    assert disk.exists()
    storage.delete(stored.rel_path)
    assert not disk.exists()
    storage.delete(stored.rel_path)  # 再删不报错
