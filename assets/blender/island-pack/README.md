# Island and Palm Source Assets

- Blender: 5.1.2
- MCP: Blender Lab MCP 1.0.0
- Deterministic seed: 20260805
- Source of truth: `tools/blender/run_island_pipeline.py`
- Build: `/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/run_island_pipeline.py`
- Validate: `/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tests/blender/test_blender_exports.py`

The reference image guides composition and style; all geometry is authored for this project. No water geometry is exported.
