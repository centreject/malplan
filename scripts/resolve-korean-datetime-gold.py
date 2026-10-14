# Resolves korean-datetime gold expectations to absolute values at fixed reference times.
import json, sys
from datetime import datetime
repo = sys.argv[1]
sys.path.insert(0, repo + "/src")
from korean_datetime.temporal.expectation import evaluate_expectation

REFS = [datetime(2026, 9, 28, 14, 30), datetime(2027, 12, 31, 23, 10)]
out = []
for line in open(repo + "/tests/data/temporal_gold.jsonl", encoding="utf-8"):
    row = json.loads(line)
    if "text" not in row:
        continue
    for ref in REFS:
        e = evaluate_expectation(row["expect"], ref)
        item = {"category": row["category"], "text": row["text"], "expect": row["expect"], "ref": ref.isoformat(timespec="minutes")}
        if e is not None:
            item["kind"] = str(getattr(e.kind, "value", e.kind))
            item["start"] = e.start.isoformat(timespec="minutes")
            if e.end is not None:
                item["end"] = e.end.isoformat(timespec="minutes")
        out.append(item)
sys.stdout.reconfigure(encoding="utf-8")
for item in out:
    print(json.dumps(item, ensure_ascii=False))
