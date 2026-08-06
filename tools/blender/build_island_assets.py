"""Deterministically author the editable tropical-island source scene."""

from __future__ import annotations

import math
import random

import bpy

from asset_contract import CONTRACT, PALM_VARIANTS, SEED


PIPELINE_PREFIXES = ("SRC_", "EXPORT_", "GEO_", "LOC_palm_", "CAM_", "LGT_")
ISLAND_COLLECTION = "SRC_island"
ISLAND_OBJECT = "GEO_island_source"
ISLAND_NODE_GROUP = "GN_island_shape"
ISLAND_MATERIAL = "MAT_island_ground"
PALM_PARAMS = {
    "upright": {"height": 6.2, "lean": 0.08, "crown": 3.2, "fronds": 13},
    "leaning": {"height": 5.7, "lean": 0.42, "crown": 3.4, "fronds": 12},
    "tall": {"height": 8.1, "lean": 0.14, "crown": 3.0, "fronds": 11},
    "wide": {"height": 5.2, "lean": 0.18, "crown": 4.2, "fronds": 15},
}


def _collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def reset_asset_scene() -> None:
    """Remove only data created by this pipeline from the current Blender file."""
    for obj in list(bpy.data.objects):
        if obj.name.startswith(PIPELINE_PREFIXES):
            bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        if collection.name.startswith(("SRC_", "EXPORT_")):
            bpy.data.collections.remove(collection)


def _srgb_channel_to_linear(value: float) -> float:
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4


def _hex_linear(value: str) -> tuple[float, float, float, float]:
    rgb = tuple(int(value[index : index + 2], 16) / 255.0 for index in (1, 3, 5))
    return (*(_srgb_channel_to_linear(channel) for channel in rgb), 1.0)


def ensure_island_material() -> bpy.types.Material:
    material = bpy.data.materials.get(ISLAND_MATERIAL)
    if material is None:
        material = bpy.data.materials.new(ISLAND_MATERIAL)
    material.use_nodes = True
    material.diffuse_color = _hex_linear("#d8c48c")
    material.metallic = 0.0
    material.roughness = 0.78

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (520, 0)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (250, 0)
    terrain_color = nodes.new("ShaderNodeVertexColor")
    terrain_color.layer_name = "terrain_color"
    terrain_color.location = (-420, 100)
    roughness = nodes.new("ShaderNodeAttribute")
    roughness.attribute_name = "terrain_roughness"
    roughness.location = (-420, -100)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 2.8
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.68
    noise.location = (-420, -330)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.23
    bump.inputs["Distance"].default_value = 0.12
    bump.location = (20, -230)
    links.new(terrain_color.outputs["Color"], shader.inputs["Base Color"])
    links.new(roughness.outputs["Fac"], shader.inputs["Roughness"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def ensure_island_node_group() -> bpy.types.NodeTree:
    node_group = bpy.data.node_groups.get(ISLAND_NODE_GROUP)
    if node_group is not None:
        bpy.data.node_groups.remove(node_group, do_unlink=True)
    node_group = bpy.data.node_groups.new(ISLAND_NODE_GROUP, "GeometryNodeTree")
    node_group.interface.new_socket(
        name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry"
    )
    node_group.interface.new_socket(
        name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry"
    )
    controls = (
        ("Size X", 36.0),
        ("Size Y", 26.0),
        ("Height", 3.8),
        ("Coast Noise", 0.34),
        ("Beach Width", 3.6),
        ("Rock Density", 0.22),
        ("Seed", float(SEED)),
    )
    for name, default in controls:
        socket = node_group.interface.new_socket(
            name=name, in_out="INPUT", socket_type="NodeSocketFloat"
        )
        socket.default_value = default
    group_input = node_group.nodes.new("NodeGroupInput")
    group_input.location = (-180, 0)
    group_output = node_group.nodes.new("NodeGroupOutput")
    group_output.location = (180, 0)
    node_group.links.new(group_input.outputs["Geometry"], group_output.inputs["Geometry"])
    return node_group


def _coast_boundary(theta: float) -> float:
    return (
        0.982
        + 0.030 * math.sin(theta * 3.0 + 0.35)
        + 0.020 * math.sin(theta * 5.0 - 1.1)
        + 0.012 * math.cos(theta * 9.0 + 0.6)
    )


def _terrain_height(x: float, y: float) -> float:
    nx = x / (CONTRACT.island_size_m[0] * 0.5)
    ny = y / (CONTRACT.island_size_m[1] * 0.5)
    radius = math.sqrt(nx * nx + ny * ny)
    theta = math.atan2(ny, nx)
    shaped_radius = radius / max(_coast_boundary(theta), 0.82)
    edge = max(0.0, 1.0 - shaped_radius)
    small_noise = math.sin(x * 2.11 + y * 1.63 + 0.7) * math.cos(y * 1.07 - 0.2)
    broad_noise = math.sin(x * 0.53 - y * 0.41 + 1.4) * math.cos(y * 0.31 + 0.9)
    height = CONTRACT.island_height_m * edge**1.42
    height += 0.34 * small_noise * edge
    height += 0.18 * broad_noise * edge
    height -= max(0.0, shaped_radius - 0.88) * 4.5
    # Shift the island's highest crown away from the central villa terrace.
    # Without this ridge the reservation flattens the radial maximum and the
    # whole island reads as a low sandbar rather than a compact tropical cay.
    height += (
        2.6
        * math.exp(-(((x + 9.0) / 4.8) ** 2 + ((y - 5.5) / 3.5) ** 2))
        * min(1.0, edge / 0.18)
    )
    height = max(0.0, height)

    # Reserve a broad, naturally feathered terrace for the villa and jetty.
    dx = max(abs(x + 1.0) - 6.0, 0.0)
    dy = max(abs(y + 0.5) - 4.5, 0.0)
    distance = math.sqrt(dx * dx + dy * dy)
    terrace_mix = max(0.0, min(1.0, 1.0 - distance / 2.5))
    if terrace_mix > 0.0:
        height = height * (1.0 - terrace_mix * 0.78) + 1.18 * terrace_mix * 0.78
    return height


def _terrain_color_and_roughness(
    x: float, y: float, height: float
) -> tuple[tuple[float, float, float, float], float, float]:
    nx = x / (CONTRACT.island_size_m[0] * 0.5)
    ny = y / (CONTRACT.island_size_m[1] * 0.5)
    radius = math.sqrt(nx * nx + ny * ny)
    theta = math.atan2(ny, nx)
    shaped_radius = radius / max(_coast_boundary(theta), 0.82)
    coast_mask = max(0.0, min(1.0, (1.0 - shaped_radius) / 0.38))
    variation = max(
        0.0,
        min(
            1.0,
            0.52
            + 0.20 * math.sin(x * 0.79 + y * 1.13)
            + 0.17 * math.sin(x * 1.73 - y * 0.61 + 0.9)
            + 0.11 * math.cos(x * 2.31 + y * 1.91 - 0.4),
        ),
    )
    wet = _hex_linear("#8e7b57")
    dry = _hex_linear("#d8c48c")
    grass = _hex_linear("#477b48")
    soil = _hex_linear("#685646")

    def blend(
        first: tuple[float, float, float, float],
        second: tuple[float, float, float, float],
        amount: float,
    ) -> tuple[float, float, float, float]:
        amount = max(0.0, min(1.0, amount))
        return tuple(
            first[index] * (1.0 - amount) + second[index] * amount
            for index in range(4)
        )

    if shaped_radius > 0.93:
        color, roughness = blend(wet, dry, (1.0 - shaped_radius) / 0.07), 0.52
    elif shaped_radius > 0.76:
        sand_mix = (0.93 - shaped_radius) / 0.17
        color = blend(dry, soil, max(0.0, sand_mix - 0.68) / 0.32)
        roughness = 0.72 + sand_mix * 0.10
    else:
        elevation_mix = max(0.0, min(1.0, (height - 0.58) / 1.15))
        interior_mix = max(0.0, min(1.0, (0.82 - shaped_radius) / 0.22))
        grass_mix = elevation_mix * interior_mix * (0.54 + variation * 0.43)
        color = blend(soil, grass, grass_mix)
        roughness = 0.90 - grass_mix * 0.08
    return color, roughness, coast_mask


def build_island_source() -> bpy.types.Object:
    collection = _collection(ISLAND_COLLECTION)
    width_segments = 96
    depth_segments = 72
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    colors: list[tuple[float, float, float, float]] = []
    roughness_values: list[float] = []
    coast_values: list[float] = []
    height_values: list[float] = []

    for iy in range(depth_segments + 1):
        y = -13.0 + 26.0 * iy / depth_segments
        for ix in range(width_segments + 1):
            x = -18.0 + 36.0 * ix / width_segments
            height = _terrain_height(x, y)
            vertices.append((x, y, height))
            color, roughness, coast = _terrain_color_and_roughness(x, y, height)
            colors.append(color)
            roughness_values.append(roughness)
            coast_values.append(coast)
            height_values.append(height / CONTRACT.island_height_m)

    row = width_segments + 1
    for iy in range(depth_segments):
        for ix in range(width_segments):
            center_x = -18.0 + 36.0 * (ix + 0.5) / width_segments
            center_y = -13.0 + 26.0 * (iy + 0.5) / depth_segments
            nx = center_x / 18.0
            ny = center_y / 13.0
            theta = math.atan2(ny, nx)
            if math.sqrt(nx * nx + ny * ny) <= _coast_boundary(theta):
                a = iy * row + ix
                faces.append((a, a + 1, a + row + 1, a + row))

    mesh = bpy.data.meshes.new("MESH_island_source")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    terrain_color = mesh.color_attributes.new(
        name="terrain_color", type="FLOAT_COLOR", domain="POINT"
    )
    coast_mask = mesh.color_attributes.new(
        name="coast_mask", type="FLOAT_COLOR", domain="POINT"
    )
    height_mask = mesh.color_attributes.new(
        name="height_mask", type="FLOAT_COLOR", domain="POINT"
    )
    terrain_roughness = mesh.color_attributes.new(
        name="terrain_roughness", type="FLOAT_COLOR", domain="POINT"
    )
    for index, color in enumerate(colors):
        terrain_color.data[index].color = color
        coast = coast_values[index]
        normalized_height = height_values[index]
        roughness = roughness_values[index]
        coast_mask.data[index].color = (coast, coast, coast, 1.0)
        height_mask.data[index].color = (
            normalized_height,
            normalized_height,
            normalized_height,
            1.0,
        )
        terrain_roughness.data[index].color = (roughness, roughness, roughness, 1.0)

    island = bpy.data.objects.new(ISLAND_OBJECT, mesh)
    collection.objects.link(island)
    island.data.materials.append(ensure_island_material())
    island["asset_role"] = "island_source"
    island["island_size_m"] = CONTRACT.island_size_m
    island["seed"] = SEED
    geometry_nodes = island.modifiers.new("Editable Island Controls", "NODES")
    geometry_nodes.node_group = ensure_island_node_group()
    subdivision = island.modifiers.new("Source Subdivision", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 1
    subdivision.render_levels = 1
    try:
        weighted = island.modifiers.new("Weighted Normals", "WEIGHTED_NORMAL")
        weighted.keep_sharp = True
    except RuntimeError:
        pass
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return island


def create_palm_placement_empties(
    island: bpy.types.Object,
) -> list[bpy.types.Object]:
    del island
    collection = _collection(ISLAND_COLLECTION)
    randomizer = random.Random(SEED)
    approved_positions = (
        (-13.4, 4.8),
        (-11.2, -7.1),
        (-8.6, 7.9),
        (-6.4, -8.8),
        (5.8, 7.5),
        (7.5, -7.2),
        (9.4, 4.5),
        (11.1, -3.8),
        (12.6, 1.0),
        (3.9, -9.2),
        (-14.1, -1.8),
        (2.2, 9.2),
    )
    empties = []
    for index, (x, y) in enumerate(approved_positions):
        empty = bpy.data.objects.new(f"LOC_palm_{index:03d}", None)
        empty.empty_display_type = "CIRCLE"
        empty.empty_display_size = 0.36
        empty.location = (x, y, _terrain_height(x, y))
        empty.rotation_euler.z = randomizer.uniform(-math.pi, math.pi)
        scale = randomizer.uniform(0.88, 1.12)
        empty.scale = (scale, scale, scale)
        empty["variant"] = ("upright", "leaning", "tall", "wide")[index % 4]
        collection.objects.link(empty)
        empties.append(empty)
    return empties


def _vertex_color_material(
    name: str,
    attribute_name: str,
    fallback_color: str,
    roughness: float,
) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = _hex_linear(fallback_color)
    material.roughness = roughness
    material.metallic = 0.0
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (420, 0)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (160, 0)
    vertex_color = nodes.new("ShaderNodeVertexColor")
    vertex_color.layer_name = attribute_name
    vertex_color.location = (-170, 50)
    links.new(vertex_color.outputs["Color"], shader.inputs["Base Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    shader.inputs["Roughness"].default_value = roughness
    return material


def ensure_palm_materials() -> tuple[bpy.types.Material, bpy.types.Material]:
    trunk = _vertex_color_material(
        "MAT_palm_trunk", "bark_color", "#6f5132", 0.88
    )
    fronds = _vertex_color_material(
        "MAT_palm_fronds", "leaf_color", "#2f6d3d", 0.72
    )
    fronds.diffuse_color = _hex_linear("#2f6d3d")
    fronds.surface_render_method = "DITHERED"
    fronds.use_transparency_overlap = False
    return trunk, fronds


def _create_color_attribute(
    mesh: bpy.types.Mesh,
    name: str,
    colors: list[tuple[float, float, float, float]],
) -> None:
    attribute = mesh.color_attributes.get(name)
    if attribute is None:
        attribute = mesh.color_attributes.new(
            name=name, type="FLOAT_COLOR", domain="POINT"
        )
    for index, color in enumerate(colors):
        attribute.data[index].color = color


def create_curved_trunk(
    variant: str, height: float, lean: float
) -> bpy.types.Object:
    collection = _collection(f"SRC_palm_{variant}")
    curve_data = bpy.data.curves.new(f"CURVE_palm_{variant}_trunk", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 1
    curve_data.bevel_depth = 0.27 if variant != "tall" else 0.24
    curve_data.bevel_resolution = 2
    curve_data.resolution_u = 2
    curve_data.twist_smooth = 6
    spline = curve_data.splines.new("NURBS")
    height_segments = 18 if variant in ("leaning", "tall") else 14
    spline.points.add(height_segments)
    for index, point in enumerate(spline.points):
        t = index / height_segments
        base_radius = curve_data.bevel_depth
        x = lean * height * t**1.72 + 0.08 * math.sin(t * math.pi * 2.0)
        y = 0.07 * math.sin(t * math.pi * 1.65 + len(variant))
        z = base_radius + (height - base_radius) * t
        point.co = (x, y, z, 1.0)
        point.radius = 1.0 - 0.48 * t
    spline.order_u = min(4, len(spline.points))
    spline.use_endpoint_u = True

    trunk = bpy.data.objects.new(
        f"GEO_palm_{variant}_trunk_source", curve_data
    )
    collection.objects.link(trunk)
    bpy.context.view_layer.objects.active = trunk
    trunk.select_set(True)
    bpy.ops.object.convert(target="MESH")
    trunk = bpy.context.active_object
    trunk.name = f"GEO_palm_{variant}_trunk_source"
    root_offset = min(vertex.co.z for vertex in trunk.data.vertices)
    for vertex in trunk.data.vertices:
        vertex.co.z -= root_offset
    trunk.data.update()
    for polygon in trunk.data.polygons:
        polygon.use_smooth = True
    trunk.data.materials.append(ensure_palm_materials()[0])

    lighter = _hex_linear("#876744")
    darker = _hex_linear("#4b3422")
    bark_colors = []
    for vertex in trunk.data.vertices:
        band = 0.5 + 0.5 * math.sin(vertex.co.z * 7.2 + vertex.co.x * 3.1)
        bark_colors.append(
            tuple(
                darker[channel] * (1.0 - 0.30 * band)
                + lighter[channel] * 0.30 * band
                for channel in range(4)
            )
        )
    _create_color_attribute(trunk.data, "bark_color", bark_colors)
    assign_wind_weights(trunk, height * 0.78)
    trunk["variant"] = variant
    trunk["asset_role"] = "palm_trunk_source"
    return trunk


def create_frond_mesh(
    variant: str, length: float, width: float
) -> bpy.types.Object:
    params = PALM_PARAMS[variant]
    collection = _collection(f"SRC_palm_{variant}")
    height = params["height"]
    lean = params["lean"]
    center = (lean * height, 0.0, height - 0.04)
    frond_count = int(params["fronds"])
    rachis_segments = 18
    leaflet_rows = 14
    leaflet_segments = 6
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    colors: list[tuple[float, float, float, float]] = []
    dark_leaf = _hex_linear("#1d4d31")
    light_leaf = _hex_linear("#4f8d49")
    variant_seed = sum(ord(char) for char in variant) + SEED
    randomizer = random.Random(variant_seed)

    for frond_index in range(frond_count):
        angle = (
            frond_index / frond_count * math.tau
            + randomizer.uniform(-0.10, 0.10)
        )
        local_length = length * randomizer.uniform(0.86, 1.08)
        local_width = width * randomizer.uniform(0.82, 1.15)
        lift = randomizer.uniform(0.18, 0.48)
        droop = randomizer.uniform(0.72, 1.24)
        side_curl = randomizer.uniform(-0.18, 0.18)

        def spine(t: float) -> tuple[float, float, float]:
            radial = local_length * t
            spine_z = center[2] + lift * math.sin(math.pi * t) - droop * t**1.72
            spine_x = center[0] + math.cos(angle) * radial
            spine_y = center[1] + math.sin(angle) * radial
            spine_x += math.cos(angle + math.pi * 0.5) * side_curl * t * t
            spine_y += math.sin(angle + math.pi * 0.5) * side_curl * t * t
            return (spine_x, spine_y, spine_z)

        # Narrow central rachis: two vertices per sample, joined as one strip.
        rachis_start = len(vertices)
        for along in range(rachis_segments + 1):
            t = along / rachis_segments
            point = spine(t)
            half_width = 0.055 * (1.0 - 0.72 * t)
            side_x = -math.sin(angle) * half_width
            side_y = math.cos(angle) * half_width
            color_mix = 0.28 + 0.42 * t
            leaf_color = tuple(
                dark_leaf[channel] * (1.0 - color_mix)
                + light_leaf[channel] * color_mix
                for channel in range(4)
            )
            vertices.extend(
                (
                    (point[0] + side_x, point[1] + side_y, point[2]),
                    (point[0] - side_x, point[1] - side_y, point[2]),
                )
            )
            colors.extend((leaf_color, leaf_color))
        for along in range(rachis_segments):
            a = rachis_start + along * 2
            faces.append((a, a + 2, a + 3, a + 1))

        # Paired tapered leaflets form the feathered palm silhouette.
        radial_direction = (math.cos(angle), math.sin(angle), 0.0)
        side_direction = (-math.sin(angle), math.cos(angle), 0.0)
        for row_index in range(leaflet_rows):
            t = 0.13 + row_index / max(leaflet_rows - 1, 1) * 0.75
            base = spine(t)
            taper = math.sin(math.pi * t) ** 0.62
            leaflet_length = (
                local_width
                * 2.15
                * taper
                * randomizer.uniform(0.84, 1.12)
            )
            for side in (-1.0, 1.0):
                leaflet_start = len(vertices)
                for segment in range(leaflet_segments + 1):
                    q = segment / leaflet_segments
                    reach = leaflet_length * q
                    forward = local_length * 0.11 * q
                    center_x = (
                        base[0]
                        + side_direction[0] * side * reach
                        + radial_direction[0] * forward
                    )
                    center_y = (
                        base[1]
                        + side_direction[1] * side * reach
                        + radial_direction[1] * forward
                    )
                    center_z = (
                        base[2]
                        - (0.08 + 0.14 * t) * q**1.45
                        + 0.035 * math.sin(math.pi * q)
                    )
                    blade_width = (
                        0.050
                        * math.sin(math.pi * max(0.0, min(1.0, q))) ** 0.65
                        * (1.0 - 0.28 * t)
                    )
                    offset_x = radial_direction[0] * blade_width
                    offset_y = radial_direction[1] * blade_width
                    vertices.extend(
                        (
                            (center_x + offset_x, center_y + offset_y, center_z),
                            (center_x - offset_x, center_y - offset_y, center_z),
                        )
                    )
                    color_mix = max(
                        0.0,
                        min(
                            1.0,
                            0.24
                            + 0.46 * t
                            + 0.18 * q
                            + 0.08 * math.sin(frond_index * 1.7 + row_index),
                        ),
                    )
                    leaf_color = tuple(
                        dark_leaf[channel] * (1.0 - color_mix)
                        + light_leaf[channel] * color_mix
                        for channel in range(4)
                    )
                    colors.extend((leaf_color, leaf_color))
                for segment in range(leaflet_segments):
                    a = leaflet_start + segment * 2
                    faces.append((a, a + 2, a + 3, a + 1))

    mesh = bpy.data.meshes.new(f"MESH_palm_{variant}_fronds")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    _create_color_attribute(mesh, "leaf_color", colors)
    fronds = bpy.data.objects.new(
        f"GEO_palm_{variant}_fronds_source", mesh
    )
    collection.objects.link(fronds)
    fronds.data.materials.append(ensure_palm_materials()[1])
    for polygon in fronds.data.polygons:
        polygon.use_smooth = True
    assign_wind_weights(fronds, height * 0.78)
    fronds["variant"] = variant
    fronds["asset_role"] = "palm_fronds_source"
    return fronds


def assign_wind_weights(
    obj: bpy.types.Object, crown_start_z: float
) -> None:
    mesh = obj.data
    attribute = mesh.color_attributes.get("wind_weight")
    if attribute is None:
        attribute = mesh.color_attributes.new(
            name="wind_weight", type="FLOAT_COLOR", domain="POINT"
        )
    if "fronds" in obj.name:
        max_radius = max(
            math.hypot(vertex.co.x, vertex.co.y) for vertex in mesh.vertices
        )
        for vertex in mesh.vertices:
            radial = math.hypot(vertex.co.x, vertex.co.y) / max(max_radius, 0.001)
            weight = 0.35 + 0.65 * max(0.0, min(1.0, radial))
            attribute.data[vertex.index].color = (weight, weight, weight, 1.0)
    else:
        min_z = min(vertex.co.z for vertex in mesh.vertices)
        max_z = max(vertex.co.z for vertex in mesh.vertices)
        for vertex in mesh.vertices:
            normalized = (vertex.co.z - min_z) / max(max_z - min_z, 0.001)
            crown_mix = max(
                0.0,
                min(1.0, (vertex.co.z - crown_start_z) / max(max_z - crown_start_z, 0.001)),
            )
            weight = 0.18 * normalized + 0.07 * crown_mix
            attribute.data[vertex.index].color = (weight, weight, weight, 1.0)


def build_palm_variant(name: str) -> bpy.types.Collection:
    if name not in PALM_VARIANTS:
        raise ValueError(f"Unknown palm variant: {name}")
    params = PALM_PARAMS[name]
    collection = _collection(f"SRC_palm_{name}")
    create_curved_trunk(name, float(params["height"]), float(params["lean"]))
    crown_width = 0.52 if name != "wide" else 0.62
    create_frond_mesh(name, float(params["crown"]), crown_width)
    collection["variant"] = name
    collection["deterministic_seed"] = SEED
    return collection
