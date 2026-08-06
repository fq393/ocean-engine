import bpy
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
runpy.run_path(str(ROOT / "tools/blender/run_island_pipeline.py"), run_name="__main__")

island = bpy.data.objects["GEO_island_source"]
size = island.dimensions
assert 35.5 <= size.x <= 36.5
assert 25.5 <= size.y <= 26.5
assert 3.2 <= size.z <= 4.4
assert bpy.data.node_groups.get("GN_island_shape") is not None
assert bpy.data.materials.get("MAT_island_ground") is not None
assert len([obj for obj in bpy.data.objects if obj.name.startswith("LOC_palm_")]) == 12
terrain_colors = island.data.color_attributes["terrain_color"].data
core_colors = {
    tuple(round(channel, 3) for channel in terrain_colors[vertex.index].color[:3])
    for vertex in island.data.vertices
    if (vertex.co.x / 18.0) ** 2 + (vertex.co.y / 13.0) ** 2 < 0.55**2
}
assert len(core_colors) >= 24, "terrain color must blend naturally instead of forming hard bands"

for variant in ("upright", "leaning", "tall", "wide"):
    collection = bpy.data.collections[f"SRC_palm_{variant}"]
    trunk = collection.objects[f"GEO_palm_{variant}_trunk_source"]
    fronds = collection.objects[f"GEO_palm_{variant}_fronds_source"]
    assert trunk.dimensions.z >= 4.5
    assert "wind_weight" in trunk.data.color_attributes
    assert "wind_weight" in fronds.data.color_attributes
    assert abs(min(vertex.co.z for vertex in trunk.data.vertices)) < 0.02
    assert len(fronds.data.vertices) >= 2500
    fronds.data.calc_loop_triangles()
    assert 3000 <= len(fronds.data.loop_triangles) <= 6500

assert bpy.data.materials["MAT_palm_trunk"]
assert bpy.data.materials["MAT_palm_fronds"]
assert bpy.data.filepath.endswith("island-palm-source.blend")
print("BLENDER_SOURCE_OK")
