from pathlib import Path

base = Path("images")
for sub in ["planets", "aspects", "signs/colorized"]:
    (base / sub).mkdir(parents=True, exist_ok=True)

planet_names = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
    "chiron","ceres","pallas","juno","vesta","lilith","priapus","northnode","southnode",
    "ascendant","descendant","midheaven","imumcoeli","vertex","antivertex","partoffortune","partofspirit","galacticcenter"
]
aspect_names = ["conjunction","opposition","square","trine","sextile","semisextile","quincunx"]
sign_names = ["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","ophiuchus","sagittarius","capricorn","aquarius","pisces"]

for name in planet_names:
    p = base / "planets" / f"{name}.svg"
    if not p.exists():
        p.write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="#1f1f2d"/><circle cx="60" cy="60" r="44" fill="#4b4b73"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#f7f7f7">{name[:4].upper()}</text></svg>',
            encoding="utf-8",
        )

for name in aspect_names:
    p = base / "aspects" / f"{name}.svg"
    if not p.exists():
        p.write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="#1f1f2d"/><circle cx="60" cy="60" r="44" fill="#5d5d8f"/><text x="60" y="66" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#f7f7f7">{name[0].upper()}</text></svg>',
            encoding="utf-8",
        )

for name in sign_names:
    p = base / "signs" / "colorized" / f"{name}.svg"
    if not p.exists():
        p.write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="20" fill="#1a1a21"/><circle cx="60" cy="60" r="44" fill="#228fbf"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#ffffff">{name[:3].upper()}</text></svg>',
            encoding="utf-8",
        )

print("placeholder icons created")
