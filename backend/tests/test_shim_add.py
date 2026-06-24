import importlib.util
import pathlib

_p = pathlib.Path(__file__).resolve().parents[2] / "blade" / "skills" / "shared" / "helpers" / "smart_doc_add.py"
_spec = importlib.util.spec_from_file_location("smart_doc_add", _p)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)


def test_wait_for_done_returns_done_after_processing():
    seq = [
        [{"doc_code": "X", "recognition_status": "processing"}],
        [{"doc_code": "X", "recognition_status": "processing"}],
        [{"doc_code": "X", "recognition_status": "done"}],
    ]
    calls = {"i": 0}

    def list_fn():
        i = min(calls["i"], len(seq) - 1)
        calls["i"] += 1
        return seq[i]

    status = mod.wait_for_done(list_fn, "X", timeout=100, interval=0,
                               sleep_fn=lambda s: None, clock=lambda: 0)
    assert status == "done"


def test_wait_for_done_times_out_returns_last():
    def list_fn():
        return [{"doc_code": "X", "recognition_status": "processing"}]

    ticks = iter([0, 0, 999])  # 第三次取时间已超 deadline

    status = mod.wait_for_done(list_fn, "X", timeout=10, interval=0,
                               sleep_fn=lambda s: None, clock=lambda: next(ticks))
    assert status == "processing"
