#!/usr/bin/env python3
"""Generates ../scene.rml: a mouth rig (lips, upper/lower teeth, tongue) with
22 viseme poses that follow the Azure Speech viseme ids 0..21.

Edit the POSES table and run:  python3 tools/gen_scene.py
"""
import math
import os

HALF_PI = math.pi / 2

# Per pose (all in px, mouth centre is 0,0, y grows downward):
#   w   half width of the mouth
#   cy  y of the lip corners (negative = smile)
#   ty  y of the top lip's middle      by  y of the bottom lip's middle
#   rc  corner roundness (0.2 pointed .. 0.55 round)
#   ut  y of the upper teeth's bottom edge   (None = hidden)
#   lt  y of the lower teeth's top edge      (None = hidden)
#   tg  (y, scaleX, scaleY) of the tongue    (None = hidden)
POSES = [
    # id, sounds,            w,  cy,  ty,  by,  rc,   ut,   lt,   tg
    (0,  "silence",          70, -5,   6,   6, 0.30, None, None, None),
    (1,  "ae, schwa, uh",    78,  0, -22,  34, 0.32,  -6, None, (46, 1.0, 1.0)),
    (2,  "aa (father)",      72,  0, -30,  56, 0.40, -12,   52, (64, 1.0, 1.0)),
    (3,  "ao (thought)",     50,  0, -30,  46, 0.50, -18, None, (58, 0.9, 1.0)),
    (4,  "eh, uh (book)",    74, -2, -18,  24, 0.32,  -4,   20, (38, 1.0, 1.0)),
    (5,  "er (bird)",        52,  0, -18,  22, 0.45,  -6,   18, (30, 0.85, 1.0)),
    (6,  "y, ee, ih",        90, -8, -14,  14, 0.28,  -1,    3, None),
    (7,  "w, oo",            24,  0, -14,  14, 0.55, None, None, None),
    (8,  "oh",               38,  0, -26,  30, 0.55, -20, None, (46, 0.7, 1.0)),
    (9,  "ow (how)",         64,  0, -28,  46, 0.45, -12, None, (56, 1.0, 1.0)),
    (10, "oy (boy)",         56,  0, -22,  36, 0.50, -10, None, (46, 0.9, 1.0)),
    (11, "ai (my)",          82, -2, -26,  44, 0.34,  -8,   40, (52, 1.0, 1.0)),
    (12, "h",                66,  0, -14,  22, 0.34,  -4, None, (36, 1.0, 1.0)),
    (13, "r",                40,  0, -14,  16, 0.50,  -4,   12, (28, 0.7, 1.0)),
    (14, "l",                66,  0, -22,  30, 0.34,  -6, None, (12, 0.5, 0.95)),
    (15, "s, z",             80, -4, -12,  12, 0.28,   0,    0, None),
    (16, "sh, ch, j, zh",    46,  0, -18,  18, 0.50,   0,    0, None),
    (17, "th (this)",        68,  0, -14,  18, 0.32,  -2, None, (16, 1.0, 0.55)),
    (18, "f, v",             66,  2, -14,   5, 0.30,   3, None, None),
    (19, "d, t, n, th",      70,  0, -14,  16, 0.32,  -2,   11, (22, 0.8, 0.7)),
    (20, "k, g, ng",         64,  0, -16,  24, 0.34,  -4,   22, (38, 1.0, 1.1)),
    (21, "p, b, m",          62,  1,   2,   2, 0.30, None, None, None),
]

TONGUE_H = 70
KT = 0.55          # top/bottom handle length as a share of the half width

_next = [100]


def nid():
    _next[0] += 1
    return f"0:{_next[0]}"


def f(v):
    return f"{v:.4f}".rstrip("0").rstrip(".") or "0"


def resolve(p):
    """Pose row -> {(objectKey, property): value} for everything that is keyed."""
    _, _, w, cy, ty, by, rc, ut, lt, tg = p
    ut = ty - 6 if ut is None else ut
    lt = by + 6 if lt is None else lt
    if tg is None:
        tg = (by + 8 + TONGUE_H / 2, 1.0, 1.0)
    return {
        ("vL", "x"): -w, ("vL", "y"): cy,
        ("vL", "outDistance"): rc * (cy - ty),   # handle towards the top lip
        ("vL", "inDistance"): rc * (by - cy),    # handle towards the bottom lip
        ("vT", "y"): ty, ("vT", "distance"): KT * w,
        ("vR", "x"): w, ("vR", "y"): cy,
        ("vR", "inDistance"): rc * (cy - ty),
        ("vR", "outDistance"): rc * (by - cy),
        ("vB", "y"): by, ("vB", "distance"): KT * w,
        ("upper", "y"): ut,
        ("lower", "y"): lt,
        ("tongue", "y"): tg[0], ("tongue", "scaleX"): tg[1], ("tongue", "scaleY"): tg[2],
    }


def main():
    ids = {k: nid() for k in ("vL", "vT", "vR", "vB", "upper", "lower", "tongue", "mouth")}
    vm, vm_inst, talk = nid(), nid(), nid()
    num_ids = {p[0]: nid() for p in POSES}
    anim_ids = {p[0]: nid() for p in POSES}
    sm, layer, st_rest, st_blend, folder = nid(), nid(), nid(), nid(), nid()
    rest = resolve(POSES[0])

    def a(key, prop):
        return f(rest[(key, prop)])

    def teeth_lines(width, height, count, sign):
        # thin separators between teeth; sign=-1 draws upward (upper teeth)
        out = []
        step = width / count
        for i in range(1, count):
            x = -width / 2 + i * step
            out.append(
                f'''                    <PointsPath name="Sela {i}">
                        <StraightVertex x="{f(x)}" y="0"/>
                        <StraightVertex x="{f(x)}" y="{f(sign * height)}"/>
                    </PointsPath>''')
        return "\n".join(out)

    o = []
    o.append(f'''<Rive version="1" kind="fragment">
    <Artboard defaultStateMachineId="{sm}" viewModelId="{vm}" viewModelInstanceId="{vm_inst}" styleId="0:5" width="500" height="500" name="Main" id="0:2">
        <LayoutComponentStyle name="Artboard Style" id="0:5"/>

        <Fill name="Background">
            <SolidColor colorValue="FFF3C9A8" name="Color"/>
        </Fill>

        <Node x="250" y="250" scaleX="2" scaleY="2" name="Mulut" id="0:10">
            <!-- first declared paints on top: teeth, tongue, then the mouth itself -->
            <Node name="Dalam mulut" id="0:11">
                <ClippingShape sourceId="{ids['mouth']}" name="Clip mulut"/>

                <Node y="{a('upper', 'y')}" name="gigi atas" id="{ids['upper']}">
                    <Shape name="Sela gigi atas">
{teeth_lines(150, 60, 6, -1)}
                        <Stroke thickness="1.5" name="Stroke">
                            <SolidColor colorValue="FFD9D2CF" name="Color"/>
                        </Stroke>
                    </Shape>
                    <Shape name="Gigi atas">
                        <Rectangle width="150" height="60" originX="0.5" originY="1" cornerRadiusTL="6" cornerRadiusTR="6" cornerRadiusBL="6" cornerRadiusBR="6" name="Path"/>
                        <Fill name="Fill">
                            <SolidColor colorValue="FFFFFFFF" name="Color"/>
                        </Fill>
                    </Shape>
                </Node>

                <Node y="{a('lower', 'y')}" name="gigi bawah" id="{ids['lower']}">
                    <Shape name="Sela gigi bawah">
{teeth_lines(126, 60, 6, 1)}
                        <Stroke thickness="1.5" name="Stroke">
                            <SolidColor colorValue="FFD9D2CF" name="Color"/>
                        </Stroke>
                    </Shape>
                    <Shape name="Gigi bawah">
                        <Rectangle width="126" height="60" originX="0.5" originY="0" cornerRadiusTL="6" cornerRadiusTR="6" cornerRadiusBL="6" cornerRadiusBR="6" name="Path"/>
                        <Fill name="Fill">
                            <SolidColor colorValue="FFF4EFEC" name="Color"/>
                        </Fill>
                    </Shape>
                </Node>

                <Node y="{a('tongue', 'y')}" scaleX="{a('tongue', 'scaleX')}" scaleY="{a('tongue', 'scaleY')}" name="lidah" id="{ids['tongue']}">
                    <Shape name="Garis lidah">
                        <PointsPath name="Path">
                            <StraightVertex x="0" y="-26"/>
                            <StraightVertex x="0" y="6"/>
                        </PointsPath>
                        <Stroke thickness="2.5" cap="round" name="Stroke">
                            <SolidColor colorValue="FFD4566A" name="Color"/>
                        </Stroke>
                    </Shape>
                    <Shape name="Lidah">
                        <Ellipse width="104" height="{TONGUE_H}" name="Path"/>
                        <Fill name="Fill">
                            <SolidColor colorValue="FFF27B8C" name="Color"/>
                        </Fill>
                    </Shape>
                </Node>
            </Node>

            <!-- paints inside one shape go last-declared-on-top:
                 lips (thick stroke), mouth interior (fill), lip seam (thin stroke) -->
            <Shape name="Bibir" id="{ids['mouth']}">
                <PointsPath isClosed="true" isClockwise="true" name="Path">
                    <CubicDetachedVertex x="{a('vL', 'x')}" y="{a('vL', 'y')}" inRotation="{f(HALF_PI)}" inDistance="{a('vL', 'inDistance')}" outRotation="{f(-HALF_PI)}" outDistance="{a('vL', 'outDistance')}" name="Sudut kiri" id="{ids['vL']}"/>
                    <CubicMirroredVertex x="0" y="{a('vT', 'y')}" rotation="0" distance="{a('vT', 'distance')}" name="Bibir atas" id="{ids['vT']}"/>
                    <CubicDetachedVertex x="{a('vR', 'x')}" y="{a('vR', 'y')}" inRotation="{f(-HALF_PI)}" inDistance="{a('vR', 'inDistance')}" outRotation="{f(HALF_PI)}" outDistance="{a('vR', 'outDistance')}" name="Sudut kanan" id="{ids['vR']}"/>
                    <CubicMirroredVertex x="0" y="{a('vB', 'y')}" rotation="{f(math.pi)}" distance="{a('vB', 'distance')}" name="Bibir bawah" id="{ids['vB']}"/>
                </PointsPath>
                <Stroke thickness="15" cap="round" join="round" name="Bibir">
                    <SolidColor colorValue="FFC8505F" name="Color"/>
                </Stroke>
                <Fill name="Rongga mulut">
                    <SolidColor colorValue="FF521420" name="Color"/>
                </Fill>
                <Stroke thickness="2.5" cap="round" join="round" name="Garis bibir">
                    <SolidColor colorValue="FF7A1F2E" name="Color"/>
                </Stroke>
            </Shape>
        </Node>
''')

    # --- state machine: same shape as avatarstudi's "Visames" layer
    def talking(value):
        return f'''                        <TransitionViewModelCondition>
                            <TransitionPropertyViewModelComparator>
                                <BindablePropertyBoolean>
                                    <DataBindContext sourcePathIds="{vm}-{talk}" propertyKey="634"/>
                                </BindablePropertyBoolean>
                            </TransitionPropertyViewModelComparator>
                            <TransitionValueBooleanComparator value="{value}"/>
                        </TransitionViewModelCondition>'''

    o.append(f'''        <StateMachine name="State Machine 1" id="{sm}">
            <StateMachineLayer name="Visames" id="{layer}">
                <AnyState x="177" y="-338"/>
                <ExitState x="257" y="-338"/>
                <EntryState x="573" y="-63">
                    <StateTransition stateToId="{st_rest}"/>
                </EntryState>
                <AnimationState animationId="{anim_ids[0]}" x="162" y="133" id="{st_rest}">
                    <StateTransition stateToId="{st_blend}" duration="60" enableEarlyExit="true">
{talking("true")}
                    </StateTransition>
                </AnimationState>
                <BlendStateDirect x="-189" y="-67" id="{st_blend}">
                    <BlendStateTransition stateToId="{st_rest}" duration="120" enableEarlyExit="true">
{talking("false")}
                    </BlendStateTransition>''')
    for p in POSES:
        o.append(f'''                    <BlendAnimationDirect blendSource="dataBindId" animationId="{anim_ids[p[0]]}">
                        <BindablePropertyNumber>
                            <DataBindContext sourcePathIds="{vm}-{num_ids[p[0]]}" propertyKey="636"/>
                        </BindablePropertyNumber>
                    </BlendAnimationDirect>''')
    o.append('''                </BlendStateDirect>
            </StateMachineLayer>
        </StateMachine>
''')

    # --- one single-frame pose per viseme; every pose keys every property
    for p in POSES:
        vals = resolve(p)
        o.append(f'        <!-- viseme {p[0]}: {p[1]} -->')
        o.append(f'        <LinearAnimation name="{p[0]}" folderId="{folder}" id="{anim_ids[p[0]]}">')
        for key in ("vL", "vT", "vR", "vB", "upper", "lower", "tongue"):
            o.append(f'            <KeyedObject objectId="{ids[key]}">')
            for (k, prop), v in vals.items():
                if k == key:
                    o.append(f'                <KeyedProperty property="{prop}">')
                    o.append(f'                    <KeyFrameDouble value="{f(v)}" interpolationType="linear"/>')
                    o.append('                </KeyedProperty>')
            o.append('            </KeyedObject>')
        o.append('        </LinearAnimation>')
    o.append(f'        <AnimationFolder name="Visame" id="{folder}"/>')
    o.append('    </Artboard>\n')

    # --- view model: isTalking + one 0..100 number per viseme id
    o.append(f'    <ViewModel defaultInstanceId="{vm_inst}" name="ViewModel1" id="{vm}">')
    o.append(f'        <ViewModelPropertyBoolean name="isTalking" id="{talk}"/>')
    for p in POSES:
        o.append(f'        <ViewModelPropertyNumber name="{p[0]}" id="{num_ids[p[0]]}"/>')
    o.append(f'        <ViewModelInstance exports="true" name="Instance" id="{vm_inst}">')
    o.append(f'            <ViewModelInstanceBoolean propertyValue="false" viewModelPropertyId="{talk}"/>')
    for p in POSES:
        o.append(f'            <ViewModelInstanceNumber propertyValue="0" viewModelPropertyId="{num_ids[p[0]]}"/>')
    o.append('        </ViewModelInstance>')
    o.append('    </ViewModel>')
    o.append('</Rive>\n')

    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scene.rml")
    with open(path, "w") as fh:
        fh.write("\n".join(o))
    print("wrote", os.path.normpath(path))


if __name__ == "__main__":
    main()
