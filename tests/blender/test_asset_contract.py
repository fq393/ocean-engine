from tools.blender.asset_contract import (
    CONTRACT,
    LOD_BUDGETS,
    PALM_VARIANTS,
    SEED,
)

assert CONTRACT.island_size_m == (36.0, 26.0)
assert CONTRACT.island_height_m == 3.8
assert CONTRACT.texture_size == 2048
assert SEED == 20260805
assert LOD_BUDGETS["island"] == ((30000, 40000), (10000, 14000), (3000, 5000))
assert LOD_BUDGETS["palm"] == ((3000, 6000), (1200, 2500), (300, 700))
assert LOD_BUDGETS["collision"][0][1] == 800
assert PALM_VARIANTS == ("upright", "leaning", "tall", "wide")
print("ASSET_CONTRACT_OK")
