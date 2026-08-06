import json
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
runpy.run_path(str(ROOT / "tools/blender/run_island_pipeline.py"), run_name="__main__")
manifest_path = ROOT / "public/assets/models/island/asset-manifest.json"
manifest = json.loads(manifest_path.read_text())

assert manifest["schemaVersion"] == 1
assert manifest["unitMeters"] == 1
assert set(manifest["island"]) == {"lod0", "lod1", "lod2", "collision"}
assert set(manifest["palms"]) == {"lod0", "lod1", "lod2"}
assert len(manifest["placements"]) == 12

for entry in [*manifest["island"].values(), *manifest["palms"].values()]:
    path = ROOT / "public" / entry["url"].lstrip("/")
    assert path.exists() and path.stat().st_size > 1024
    assert len(entry["sha256"]) == 64
    assert entry["triangles"] > 0

assert 30000 <= manifest["island"]["lod0"]["triangles"] <= 40000
assert 10000 <= manifest["island"]["lod1"]["triangles"] <= 14000
assert 3000 <= manifest["island"]["lod2"]["triangles"] <= 5000
assert manifest["island"]["collision"]["triangles"] <= 800
print("BLENDER_EXPORTS_OK")
