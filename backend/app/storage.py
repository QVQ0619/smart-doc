import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path


@dataclass
class StoredBlob:
    object_key: str
    size_bytes: int
    sha256: str


class FileTooLargeError(Exception):
    def __init__(self, limit_bytes: int):
        self.limit_bytes = limit_bytes
        super().__init__(f"file exceeds {limit_bytes} bytes")


class FileStorage:
    CHUNK = 1024 * 1024

    def __init__(self, base_dir):
        self.base_dir = Path(base_dir)

    def save(self, prefix: str, original_name: str, stream, max_bytes: int) -> StoredBlob:
        ext = Path(original_name).suffix
        object_key = f"{prefix}/{uuid.uuid4().hex}{ext}"
        dest = self.base_dir / object_key
        dest.parent.mkdir(parents=True, exist_ok=True)

        hasher = hashlib.sha256()
        size = 0
        try:
            with dest.open("wb") as f:
                while True:
                    chunk = stream.read(self.CHUNK)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > max_bytes:
                        raise FileTooLargeError(max_bytes)
                    hasher.update(chunk)
                    f.write(chunk)
        except Exception:
            dest.unlink(missing_ok=True)
            raise

        return StoredBlob(object_key, size, hasher.hexdigest())

    def delete(self, object_key: str) -> None:
        (self.base_dir / object_key).unlink(missing_ok=True)


def get_storage() -> "FileStorage":
    from .config import settings

    return FileStorage(settings.storage_dir)
