"""Validation helpers for generated island GLB files and metadata."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


def validate_manifest_exports(manifest_path: Path) -> dict[str, object]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["schemaVersion"] == 1
    assert manifest["unitMeters"] == 1
    assert len(manifest["placements"]) == 12
    checked = []
    for family in ("island", "palms"):
        for key, entry in manifest[family].items():
            path = manifest_path.parents[3] / entry["url"].lstrip("/")
            assert path.exists() and path.stat().st_size > 1024
            assert hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"]
            assert entry["triangles"] > 0
            bounds = entry["bounds"]
            extents = [
                bounds["max"][axis] - bounds["min"][axis] for axis in range(3)
            ]
            assert all(extent >= 0.0 for extent in extents)
            assert max(extents) <= 45.0
            if family == "island" and key != "collision":
                assert extents[2] < 6.0
            checked.append(path.name)
    return {"checked": checked, "count": len(checked)}
