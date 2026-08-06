"""Shared contract for the Blender island and palm asset pipeline."""

from dataclasses import dataclass
from pathlib import Path

SEED = 20260805
PALM_VARIANTS = ("upright", "leaning", "tall", "wide")
LOD_BUDGETS = {
    "island": ((30000, 40000), (10000, 14000), (3000, 5000)),
    "palm": ((3000, 6000), (1200, 2500), (300, 700)),
    "collision": ((100, 800),),
}


@dataclass(frozen=True)
class AssetContract:
    island_size_m: tuple[float, float]
    island_height_m: float
    texture_size: int
    palm_texture_size: int
    wet_sand_width_m: float
    dry_sand_width_m: float
    source_blend: Path
    export_dir: Path


ROOT = Path(__file__).resolve().parents[2]
CONTRACT = AssetContract(
    island_size_m=(36.0, 26.0),
    island_height_m=3.8,
    texture_size=2048,
    palm_texture_size=1024,
    wet_sand_width_m=1.4,
    dry_sand_width_m=3.6,
    source_blend=ROOT / "assets/blender/island-pack/island-palm-source.blend",
    export_dir=ROOT / "public/assets/models/island",
)
