# Builds the Zafraan cast with MPFB2 (MakeHuman for Blender) and exports one GLB.
# Needs the MPFB2 extension (and its CC0 MakeHuman asset packs) installed in Blender 4.x.
# Run: blender -b --python tools/build_people.py -- public/models/people.glb [guest,waiter,...]
import bpy, sys, os, math

S = __import__("bl_ext.user_default.mpfb.services", fromlist=["HumanService"])
HumanService = S.HumanService

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.join(os.path.dirname(__file__), "people.glb")
ONLY = argv[1].split(",") if len(argv) > 1 else None

def race(a, c, f):
    return {"asian": a, "caucasian": c, "african": f}

# South-Asian looking mix for everybody, varied per person
CAST = {
    "guest": dict(gender=1.0, age=0.42, muscle=0.55, weight=0.5, height=0.55, race=race(0.35, 0.45, 0.2),
                  skin="young_caucasian_male/young_caucasian_male.mhmat", hair="short02/short02.mhclo",
                  brows="eyebrow001/eyebrow001.mhclo",
                  clothes=["male_casualsuit05/male_casualsuit05.mhclo", "shoes01/shoes01.mhclo"]),
    "waiter": dict(gender=1.0, age=0.5, muscle=0.5, weight=0.45, height=0.5, race=race(0.3, 0.4, 0.3),
                   skin="middleage_caucasian_male/middleage_caucasian_male.mhmat", hair="short04/short04.mhclo",
                   brows="eyebrow002/eyebrow002.mhclo",
                   clothes=["male_elegantsuit01/male_elegantsuit01.mhclo", "shoes04/shoes04.mhclo"]),
    "chef": dict(gender=1.0, age=0.62, muscle=0.5, weight=0.62, height=0.48, race=race(0.3, 0.4, 0.3),
                 skin="middleage_caucasian_male/middleage_caucasian_male.mhmat", hair="short01/short01.mhclo",
                 brows="eyebrow003/eyebrow003.mhclo",
                 clothes=["male_casualsuit06/male_casualsuit06.mhclo", "shoes03/shoes03.mhclo"]),
    "dinerA": dict(gender=0.0, age=0.4, muscle=0.45, weight=0.48, height=0.45, race=race(0.35, 0.45, 0.2),
                   skin="young_caucasian_female/young_caucasian_female.mhmat", hair="long01/long01.mhclo",
                   brows="eyebrow009/eyebrow009.mhclo",
                   clothes=["female_elegantsuit01/female_elegantsuit01.mhclo", "shoes03/shoes03.mhclo"]),
    "dinerB": dict(gender=1.0, age=0.45, muscle=0.5, weight=0.55, height=0.52, race=race(0.3, 0.4, 0.3),
                   skin="young_caucasian_male2/young_caucasian_male2.mhmat", hair="short03/short03.mhclo",
                   brows="eyebrow001/eyebrow001.mhclo",
                   clothes=["male_casualsuit03/male_casualsuit03.mhclo", "shoes02/shoes02.mhclo"]),
    "dinerC": dict(gender=0.0, age=0.45, muscle=0.45, weight=0.52, height=0.42, race=race(0.35, 0.35, 0.3),
                   skin="middleage_caucasian_female/middleage_caucasian_female.mhmat", hair="braid01/braid01.mhclo",
                   brows="eyebrow010/eyebrow010.mhclo",
                   clothes=["female_elegantsuit01/female_elegantsuit01.mhclo", "shoes03/shoes03.mhclo"]),
    "dinerD": dict(gender=1.0, age=0.58, muscle=0.5, weight=0.6, height=0.5, race=race(0.3, 0.5, 0.2),
                   skin="middleage_caucasian_male/middleage_caucasian_male.mhmat", hair="short02/short02.mhclo",
                   brows="eyebrow002/eyebrow002.mhclo",
                   clothes=["male_casualsuit01/male_casualsuit01.mhclo", "shoes04/shoes04.mhclo"]),
}

bpy.ops.wm.read_homefile(use_empty=True)

def build(name, o):
    info = HumanService._create_default_human_info_dict()
    info["name"] = name
    ph = info["phenotype"]
    for k in ("gender", "age", "muscle", "weight", "height"):
        ph[k] = o[k]
    ph["proportions"] = 0.6
    ph["race"] = o["race"]
    info["rig"] = "mixamo"
    info["eyes"] = "low-poly/low-poly.mhclo"
    info["eyebrows"] = o["brows"]
    info["eyelashes"] = "eyelashes01/eyelashes01.mhclo"
    info["hair"] = o["hair"]
    info["clothes"] = o["clothes"]
    info["skin_mhmat"] = o["skin"]
    info["skin_material_type"] = "MAKESKIN"
    info["eyes_material_type"] = "MAKESKIN"
    settings = HumanService.get_default_deserialization_settings()
    settings["subdiv_levels"] = 0
    settings["override_skin_model"] = "MAKESKIN"
    settings["detailed_helpers"] = True
    return HumanService.deserialize_from_dict(info, settings)

def image_of(mat, *prefer):
    if not mat or not mat.use_nodes:
        return None
    imgs = [n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
    for p in prefer:
        for i in imgs:
            if p in i.name.lower() or p in os.path.basename(i.filepath).lower():
                return i
    return imgs[0] if imgs else None

done_imgs = set()
def shrink(img, size):
    if img.name in done_imgs:
        return
    done_imgs.add(img.name)
    w, h = img.size
    if max(w, h) > size:
        img.scale(size, max(1, round(h * size / w)))

def simplify_material(mat, kind):
    """Swap MakeSkin node trees for a plain Principled BSDF the glTF exporter understands."""
    img = image_of(mat, "diffuse", "color", "albedo")
    nt = mat.node_tree
    old_col = None
    for n in nt.nodes:
        if n.type == "BSDF_PRINCIPLED":
            old_col = tuple(n.inputs["Base Color"].default_value)
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = 0.55 if kind == "skin" else 0.85
    if img:
        shrink(img, 1024 if kind == "skin" else 512)
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if kind in ("hair", "eyebrows", "eyelashes"):
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    elif old_col:
        bsdf.inputs["Base Color"].default_value = old_col
    mat.name = f"{kind}"

HAIRS = ("short", "long", "bob", "braid", "ponytail", "afro")
def kind_of(obj):
    n = obj.data.name.lower()
    if n.startswith("eyebrow"):
        return "eyebrows"
    if n.startswith("eyelash"):
        return "eyelashes"
    if "poly" in n:
        return "eyes"
    if n.startswith(HAIRS):
        return "hair"
    if n.startswith("shoes"):
        return "shoes"
    return "cloth"

def bake(obj):
    """Freeze shape keys and mask/delete modifiers so the export is a plain skinned mesh."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if obj.data.shape_keys:
        obj.shape_key_add(name="__mix", from_mix=True)
        keys = obj.data.shape_keys.key_blocks
        mix = keys["__mix"]
        for v, kv in zip(obj.data.vertices, mix.data):
            v.co = kv.co
        obj.shape_key_clear()
    for m in list(obj.modifiers):
        if m.type in ("MASK", "SUBSURF"):
            if m.type == "MASK":
                bpy.ops.object.modifier_apply(modifier=m.name)
            else:
                obj.modifiers.remove(m)

x = 0.0
names = []
for name, o in CAST.items():
    if ONLY and name not in ONLY:
        continue
    body = build(name, o)
    body["is_body"] = True
    rig = body.parent
    rig.name = name
    for child in list(rig.children):
        if child.type != "MESH":
            continue
        k = "skin" if child == body else kind_of(child)
        bake(child)
        for slot in child.material_slots:
            if slot.material:
                slot.material = slot.material.copy() if slot.material.users > 1 else slot.material
                simplify_material(slot.material, k)
                slot.material.name = f"{name}.{k}"
        child.name = f"{name}.{k}"
    rig.location.x = x
    x += 1.2
    names.append(name)
    print("BUILT", name, [c.name for c in rig.children])

# strip anything that isn't a rig or a mesh
for ob in list(bpy.data.objects):
    if ob.type not in ("ARMATURE", "MESH"):
        bpy.data.objects.remove(ob)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", use_selection=False,
    export_apply=False, export_animations=False, export_skins=True,
    export_image_format="WEBP", export_image_quality=82,
    export_normals=True, export_tangents=False, export_morph=False,
    export_yup=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
    export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
)
print("EXPORTED", OUT, os.path.getsize(OUT), names)
