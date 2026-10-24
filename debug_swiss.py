import json, subprocess, sys, os
ROOT = r'c:\Users\Caio Patricio\Videos\sky2'
req = {'historicalYear': 2000, 'month': 8, 'day': 21, 'hour': 12, 'minute': 0, 'utcOffset': 3, 'lat': 31.7054, 'long': 35.2024, 'ayanamsa': 0, 'houseSystemCode': 'P'}
out = subprocess.check_output([sys.executable, os.path.join(ROOT, 'py', 'swiss_ephemeris_service.py')], input=json.dumps(req).encode(), cwd=ROOT)
print(out.decode())
