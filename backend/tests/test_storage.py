import hashlib
import io

import pytest

from app.storage import FileStorage, FileTooLargeError


def test_save_writes_under_prefix_and_returns_metadata(storage_dir):
    storage = FileStorage(storage_dir)
    data = b"hello rule doc"
    blob = storage.save("standard_doc", "policy.pdf", io.BytesIO(data), max_bytes=1024)

    assert blob.object_key.startswith("standard_doc/")
    assert blob.object_key.endswith(".pdf")
    assert blob.size_bytes == len(data)
    assert blob.sha256 == hashlib.sha256(data).hexdigest()
    disk = storage_dir / blob.object_key
    assert disk.exists()
    assert disk.read_bytes() == data


def test_save_rejects_oversize_no_orphan(storage_dir):
    storage = FileStorage(storage_dir)
    with pytest.raises(FileTooLargeError):
        storage.save("standard_doc", "big.bin", io.BytesIO(b"x" * 100), max_bytes=10)
    prefix_dir = storage_dir / "standard_doc"
    if prefix_dir.exists():
        assert list(prefix_dir.iterdir()) == []


def test_delete_is_idempotent(storage_dir):
    storage = FileStorage(storage_dir)
    blob = storage.save("standard_doc", "a.txt", io.BytesIO(b"data"), max_bytes=1024)
    disk = storage_dir / blob.object_key
    assert disk.exists()
    storage.delete(blob.object_key)
    assert not disk.exists()
    storage.delete(blob.object_key)  # 再删不报错
