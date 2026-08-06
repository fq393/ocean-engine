"""Create runtime LODs and export the island asset pack as glTF binaries."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

from asset_contract import CONTRACT, LOD_BUDGETS, PALM_VARIANTS, SEED
from build_island_assets import PALM_PARAMS, _coast_boundary, _terrain_height


def _triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def _export_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def duplicate_evaluated(obj: bpy.types.Object, name: str) -> bpy.types.Object:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(
        evaluated, preserve_all_data_layers=True, depsgraph=depsgraph
    )
    duplicate = bpy.data.objects.new(name, mesh)
    duplicate.matrix_world = obj.matrix_world.copy()
    for material in obj.data.materials:
        if material is not None and material.name not in duplicate.data.materials:
            duplicate.data.materials.append(material)
    return duplicate


def _apply_decimate(obj: bpy.types.Object, target: int) -> None:
    current = _triangle_count(obj)
    if current <= target:
        return
    modifier = obj.modifiers.new("Budget Decimate", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = max(0.01, min(1.0, target / current))
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def simplify_to_budget(
    obj: bpy.types.Object, minimum: int, maximum: int
) -> bpy.types.Object:
    current = _triangle_count(obj)
    if minimum <= current <= maximum:
        return obj
    if current < minimum:
        raise AssertionError(
            f"{obj.name} has {current} triangles, below required minimum {minimum}"
        )
    target = int(minimum + (maximum - minimum) * 0.62)
    _apply_decimate(obj, target)
    actual = _triangle_count(obj)
    if actual > maximum:
        _apply_decimate(obj, maximum - 8)
        actual = _triangle_count(obj)
    if not minimum <= actual <= maximum:
        raise AssertionError(
            f"{obj.name} decimated to {actual}, expected {minimum}..{maximum}"
        )
    return obj


def _copy_wind_attribute(obj: bpy.types.Object) -> None:
    source = obj.data.color_attributes.get("wind_weight")
    if source is None or obj.data.color_attributes.get("_WIND_WEIGHT") is not None:
        return
    exported = obj.data.color_attributes.new(
        name="_WIND_WEIGHT", type="FLOAT_COLOR", domain="POINT"
    )
    for index, value in enumerate(source.data):
        exported.data[index].color = value.color


def build_island_lods(source: bpy.types.Object) -> dict[str, bpy.types.Object]:
    lods: dict[str, bpy.types.Object] = {}
    for index, (minimum, maximum) in enumerate(LOD_BUDGETS["island"]):
        key = f"lod{index}"
        obj = duplicate_evaluated(source, f"GEO_island_{key}")
        _export_collection(f"EXPORT_island_{key}").objects.link(obj)
        simplify_to_budget(obj, minimum, maximum)
        obj["asset_role"] = "island_runtime"
        obj["lod"] = index
        lods[key] = obj
    return lods


def build_palm_libraries() -> dict[str, bpy.types.Collection]:
    libraries: dict[str, bpy.types.Collection] = {}
    for lod_index, (minimum, maximum) in enumerate(LOD_BUDGETS["palm"]):
        lod_key = f"lod{lod_index}"
        library = _export_collection(f"EXPORT_palms_{lod_key}")
        target_fraction = 0.12 if lod_index == 0 else 0.56
        target = int(minimum + (maximum - minimum) * target_fraction)
        for variant in PALM_VARIANTS:
            source_collection = bpy.data.collections[f"SRC_palm_{variant}"]
            duplicates = []
            for role in ("trunk", "fronds"):
                source = source_collection.objects[
                    f"GEO_palm_{variant}_{role}_source"
                ]
                duplicate = duplicate_evaluated(
                    source, f"GEO_palm_{variant}_{role}_{lod_key}"
                )
                library.objects.link(duplicate)
                _copy_wind_attribute(duplicate)
                duplicates.append(duplicate)
            current = sum(_triangle_count(obj) for obj in duplicates)
            if current > target:
                ratio_target = target / current
                for obj in duplicates:
                    _apply_decimate(
                        obj,
                        max(24, int(_triangle_count(obj) * ratio_target)),
                    )
            actual = sum(_triangle_count(obj) for obj in duplicates)
            if not minimum <= actual <= maximum:
                raise AssertionError(
                    f"Palm {variant} {lod_key} has {actual} triangles, expected {minimum}..{maximum}"
                )
            for obj in duplicates:
                obj["variant"] = variant
                obj["lod"] = lod_index
        libraries[lod_key] = library
    return libraries


def build_collision(source: bpy.types.Object) -> bpy.types.Object:
    del source
    segments = 64
    radial_steps = (0.34, 0.68, 1.0)
    vertices: list[tuple[float, float, float]] = [(0.0, 0.0, 1.05)]
    faces: list[tuple[int, ...]] = []
    for radial in radial_steps:
        for index in range(segments):
            theta = index / segments * math.tau
            boundary = _coast_boundary(theta)
            x = math.cos(theta) * 18.0 * boundary * radial
            y = math.sin(theta) * 13.0 * boundary * radial
            z = max(0.08, _terrain_height(x, y) - 0.08)
            vertices.append((x, y, z))
    for index in range(segments):
        faces.append((0, 1 + index, 1 + (index + 1) % segments))
    for ring in range(len(radial_steps) - 1):
        first = 1 + ring * segments
        second = first + segments
        for index in range(segments):
            faces.append(
                (
                    first + index,
                    second + index,
                    second + (index + 1) % segments,
                    first + (index + 1) % segments,
                )
            )
    bottom_ring_start = len(vertices)
    for index in range(segments):
        theta = index / segments * math.tau
        boundary = _coast_boundary(theta)
        vertices.append(
            (
                math.cos(theta) * 18.0 * boundary,
                math.sin(theta) * 13.0 * boundary,
                -1.25,
            )
        )
    top_ring_start = 1 + (len(radial_steps) - 1) * segments
    for index in range(segments):
        faces.append(
            (
                top_ring_start + index,
                bottom_ring_start + index,
                bottom_ring_start + (index + 1) % segments,
                top_ring_start + (index + 1) % segments,
            )
        )
    bottom_center = len(vertices)
    vertices.append((0.0, 0.0, -1.25))
    for index in range(segments):
        faces.append(
            (
                bottom_center,
                bottom_ring_start + (index + 1) % segments,
                bottom_ring_start + index,
            )
        )
    mesh = bpy.data.meshes.new("MESH_island_collision")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    collision = bpy.data.objects.new("GEO_island_collision", mesh)
    _export_collection("EXPORT_island_collision").objects.link(collision)
    collision.display_type = "WIRE"
    collision["asset_role"] = "collision"
    if _triangle_count(collision) > LOD_BUDGETS["collision"][0][1]:
        raise AssertionError("Island collision exceeded triangle budget")
    return collision


def export_glb(objects: list[bpy.types.Object], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_tangents=False,
        export_attributes=True,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.object.select_all(action="DESELECT")


def _combined_bounds(objects: list[bpy.types.Object]) -> dict[str, list[float]]:
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects
        for corner in obj.bound_box
    ]
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return {
        "min": [round(value, 5) for value in minimum],
        "max": [round(value, 5) for value in maximum],
    }


def _entry(path: Path, objects: list[bpy.types.Object]) -> dict[str, object]:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return {
        "url": f"/assets/models/island/{path.name}",
        "triangles": sum(_triangle_count(obj) for obj in objects),
        "sha256": digest,
        "bounds": _combined_bounds(objects),
        "objects": [obj.name for obj in objects],
    }


def write_manifest(
    exports: dict[str, dict[str, tuple[Path, list[bpy.types.Object]]]],
    placements: list[bpy.types.Object],
) -> Path:
    manifest = {
        "schemaVersion": 1,
        "unitMeters": 1,
        "coordinateSystem": "gltf-y-up",
        "seed": SEED,
        "windAttribute": "_WIND_WEIGHT",
        "island": {
            key: _entry(path, objects)
            for key, (path, objects) in exports["island"].items()
        },
        "palms": {
            key: _entry(path, objects)
            for key, (path, objects) in exports["palms"].items()
        },
        "placements": [
            {
                "variant": empty["variant"],
                "position": [
                    round(empty.location.x, 5),
                    round(empty.location.z, 5),
                    round(-empty.location.y, 5),
                ],
                "rotationY": round(-empty.rotation_euler.z, 6),
                "scale": round(empty.scale.x, 5),
            }
            for empty in placements
        ],
        "metrics": {
            "materialCount": 3,
            "textureCount": 0,
            "placementCount": len(placements),
        },
    }
    path = CONTRACT.export_dir / "asset-manifest.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return path


def export_asset_pack(
    island_source: bpy.types.Object, placements: list[bpy.types.Object]
) -> Path:
    CONTRACT.export_dir.mkdir(parents=True, exist_ok=True)
    island_lods = build_island_lods(island_source)
    collision = build_collision(island_source)
    palm_libraries = build_palm_libraries()
    exports: dict[str, dict[str, tuple[Path, list[bpy.types.Object]]]] = {
        "island": {},
        "palms": {},
    }
    for key, obj in island_lods.items():
        path = CONTRACT.export_dir / f"island_base_{key}.glb"
        export_glb([obj], path)
        exports["island"][key] = (path, [obj])
    collision_path = CONTRACT.export_dir / "island_collision.glb"
    export_glb([collision], collision_path)
    exports["island"]["collision"] = (collision_path, [collision])
    for key, collection in palm_libraries.items():
        objects = list(collection.objects)
        path = CONTRACT.export_dir / f"palm_library_{key}.glb"
        export_glb(objects, path)
        exports["palms"][key] = (path, objects)
    return write_manifest(exports, placements)
