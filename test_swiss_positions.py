import json, subprocess, sys, os
ROOT = os.path.dirname(__file__)
CASES = [
    ('2000', 2000), ('1500', 1500), ('1000', 1000), ('500', 500), ('1 BC / ano astronômico 0', -1), ('7 AC / ano astronômico -6', -7)
]
REQ_OBJECTS = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Chiron','Ceres','Pallas','Juno','Vesta','North Node','South Node','Lilith','Priapus','Ascendant Symbol','Midheaven','Descendant','Imum Coeli','Vertex','Anti-Vertex','Part of Fortune','Part of Spirit','Galactic Center']
failed = False
for label, year in CASES:
    req = {'historicalYear': year, 'month': 8, 'day': 21, 'hour': 12, 'minute': 0, 'utcOffset': 3, 'lat': 31.7054, 'long': 35.2024, 'ayanamsa': 0, 'houseSystemCode': 'P'}
    out = subprocess.check_output([sys.executable, os.path.join(ROOT,'py','swiss_ephemeris_service.py')], input=json.dumps(req).encode(), cwd=ROOT)
    data = json.loads(out)
    print('\nDATA', label, 'success=', data.get('success'))
    if not data.get('success'):
        print(data.get('error')); failed = True; continue
    for obj in REQ_OBJECTS:
        pos = data.get('positions', {}).get(obj, {})
        if not isinstance(pos.get('position'), (int,float)):
            print('ERRO', obj, pos.get('error', 'sem posição'))
            failed = True
        else:
            print(obj, round(pos['position'], 6))
    if len(data.get('houseCusps', [])) != 12:
        print('ERRO casas Placidus:', len(data.get('houseCusps', [])))
        failed = True
if failed:
    print('\nFALHOU: rode install_swiss_ephemeris_windows.bat para baixar as efemérides antigas que faltam.')
    sys.exit(1)
print('\nTODAS AS DATAS OK')
