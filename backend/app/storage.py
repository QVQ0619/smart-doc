import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path


@dataclass
class StoredFile:
    stored_name: str
    rel_path: str
    size_bytes: int
    sha256: str


class FileTooLargeError(Exception):
    def __init__(self, limit_bytes: int):
        self.limit_bytes = limit_bytes
        super().__init__(f"file exceeds {limit_bytes} bytes")


class Storage:
    CHUNK = 1024 * 1024

    def __init__(self, base_dir):
        self.base_dir = Path(base_dir)

    def save(self, category: str, original_name: str, stream, max_bytes: int) -> StoredFile:
        ext = Path(original_name).suffix
        stored_name = f"{uuid.uuid4().hex}{ext}"
        rel_path = f"{category}/{stored_name}"
        dest = self.base_dir / category / stored_name
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

        return StoredFile(stored_name, rel_path, size, hasher.hexdigest())

    def delete(self, rel_path: str) -> None:
        (self.base_dir / rel_path).unlink(missing_ok=True)


def get_storage() -> Storage:
    from .config import settings

    return Storage(settings.storage_dir)
