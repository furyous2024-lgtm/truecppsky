import re, pathlib
root = pathlib.Path('.')
text = root.read_text('index.html', encoding='utf-8')
refs = re.findall(r'src\s*=\s*"([^\"]+)"|href\s*=\s*"([^\"]+)"|url\(([^)]+)\)', text)
files = set()
for a,b,c in refs:
    v = a or b or c
    v = v.strip()
    v = v.strip('"')
    v = v.strip("'")
    if not v or v.startswith(('http','data:','mailto:','javascript:')) or v.startswith('#'):
        continue
    v = re.split(r'[?#]', v)[0]
    if v.startswith('/'):
        v = v[1:]
    if v.startswith('./'):
        v = v[2:]
    files.add(v)
missing = [f for f in sorted(files) if not (root / f).exists()]
print('checked', len(files), 'refs')
print('missing', len(missing))
for m in missing[:200]:
    print(m)
