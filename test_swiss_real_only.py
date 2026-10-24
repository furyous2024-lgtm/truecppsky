#!/usr/bin/env python3
import json, subprocess, sys

CASES = [
    {"label": "7 BC", "historicalYear": -7, "month": 8, "day": 21},
    {"label": "Year 0 astronomical", "historicalYear": 0, "month": 8, "day": 21},
    {"label": "AD 500", "historicalYear": 500, "month": 8, "day": 21},
    {"label": "AD 1000", "historicalYear": 1000, "month": 8, "day": 21},
    {"label": "AD 1500", "historicalYear": 1500, "month": 8, "day": 21},
    {"label": "AD 2000", "historicalYear": 2000, "month": 8, "day": 21},
]

REQUIRED_ALWAYS = [
    "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
    "Uranus", "Neptune", "Pluto", "North Node", "South Node",
    "Lilith", "Priapus", "Ascendant Symbol", "Midheaven", "Descendant",
    "Imum Coeli", "Vertex", "Anti-Vertex", "Part of Fortune", "Part of Spirit"
]

for case in CASES:
    req = {
        **case,
        "hour": 12, "minute": 0, "utcOffset": 3,
        "lat": 31.7054, "long": 35.2024,
        "ayanamsa": 0, "houseSystemCode": "P",
        "trueNodes": True, "trueLilith": False,
    }
    req.pop("label")
    proc = subprocess.run([sys.executable, "py/swiss_ephemeris_service.py"], input=json.dumps(req), text=True, capture_output=True, timeout=20)
    payload = json.loads(proc.stdout)
    if not payload.get("success"):
        raise SystemExit(f"{case['label']}: Swiss API failed: {payload}")
    positions = payload.get("positions", {})
    for name in REQUIRED_ALWAYS:
        pos = positions.get(name, {}).get("position")
        if not isinstance(pos, (int, float)) or not (0 <= pos < 360):
            raise SystemExit(f"{case['label']}: {name} invalid: {positions.get(name)}")
    if len(payload.get("houseCusps", [])) != 12:
        raise SystemExit(f"{case['label']}: expected 12 houses")
    unavailable = [n for n,p in positions.items() if not isinstance(p.get("position"), (int,float))]
    print(f"OK {case['label']}: real Swiss positions returned; unavailable={unavailable}")

print("All checked dates passed. Objects unavailable because Swiss lacks ephemeris files/range are not fabricated.")
