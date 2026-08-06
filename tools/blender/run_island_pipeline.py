"""Build and save the deterministic editable island source scene."""

from __future__ import annotations

import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from asset_contract import CONTRACT  # noqa: E402
from build_island_assets import (  # noqa: E402
    build_palm_variant,
    build_island_source,
    create_palm_placement_empties,
    reset_asset_scene,
)
from export_island_assets import export_asset_pack  # noqa: E402
from validate_island_assets import validate_manifest_exports  # noqa: E402


def main() -> None:
    reset_asset_scene()
    island = build_island_source()
    placements = create_palm_placement_empties(island)
    for variant in ("upright", "leaning", "tall", "wide"):
        build_palm_variant(variant)
    CONTRACT.source_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(CONTRACT.source_blend))
    manifest_path = export_asset_pack(island, placements)
    validate_manifest_exports(manifest_path)


if __name__ == "__main__":
    main()
