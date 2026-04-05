"""
Launch Blender GUI and import a mesh (STL or OBJ). Invoked as:
  blender --python scripts/blender_import_launch.py -- /absolute/path/to/file.stl
Sets metric units (mm) and frames the imported object when possible.
"""
import sys


def main():
    argv = sys.argv
    if "--" not in argv:
        print("blender_import_launch: missing -- <filepath>")
        return
    fp = argv[argv.index("--") + 1]
    import bpy

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    try:
        scene.unit_settings.length_unit = "MILLIMETERS"
    except Exception:
        pass

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    low = fp.lower()
    if low.endswith(".stl"):
        try:
            bpy.ops.wm.stl_import(filepath=fp)
        except Exception:
            bpy.ops.import_mesh.stl(filepath=fp)
    elif low.endswith(".obj"):
        try:
            bpy.ops.wm.obj_import(filepath=fp)
        except Exception:
            bpy.ops.import_scene.obj(filepath=fp)
    else:
        print("blender_import_launch: use .stl or .obj")
        return

    if bpy.context.selected_objects:
        obj = bpy.context.selected_objects[0]
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
        except Exception:
            pass
        try:
            bpy.ops.object.shade_smooth()
        except Exception:
            pass
        try:
            for area in bpy.context.screen.areas:
                if area.type == "VIEW_3D":
                    for reg in area.regions:
                        if reg.type == "WINDOW":
                            override = bpy.context.copy()
                            override["area"] = area
                            override["region"] = reg
                            bpy.ops.view3d.view_all(override)
                            break
                    break
        except Exception:
            pass


if __name__ == "__main__":
    main()
