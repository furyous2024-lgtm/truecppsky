#!/usr/bin/env python3
import json, sys, os, math, datetime, re
from zoneinfo import ZoneInfo
try:
    import swisseph as swe
except Exception as exc:
    print(json.dumps({"success": False, "error": f"pyswisseph not available: {exc}"}))
    sys.exit(0)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
EPHE = os.path.join(ROOT, 'ephe')
swe.set_ephe_path(EPHE)

SIGNS = {
    'Aries':0,'Taurus':30,'Gemini':60,'Cancer':90,'Leo':120,'Virgo':150,
    'Libra':180,'Scorpio':210,'Sagittarius':240,'Capricorn':270,'Aquarius':300,'Pisces':330
}

MONTHS = {
    'january':1,'jan':1,'janeiro':1,
    'february':2,'feb':2,'fevereiro':2,
    'march':3,'mar':3,'marco':3,'março':3,
    'april':4,'apr':4,'abril':4,
    'may':5,'maio':5,
    'june':6,'jun':6,'junho':6,
    'july':7,'jul':7,'julho':7,
    'august':8,'aug':8,'agosto':8,
    'september':9,'sep':9,'sept':9,'setembro':9,
    'october':10,'oct':10,'outubro':10,
    'november':11,'nov':11,'novembro':11,
    'december':12,'dec':12,'dezembro':12,
}

def parse_int_field(req, names, default=None, min_value=None, max_value=None):
    for name in names:
        if name in req and req.get(name) not in (None, ''):
            value = req.get(name)
            if isinstance(value, str):
                value = value.strip()
                if not value:
                    continue
            try:
                parsed = int(float(value))
            except Exception:
                raise ValueError(f'invalid {name}: {value!r}')
            if min_value is not None and parsed < min_value:
                raise ValueError(f'{name} must be >= {min_value}')
            if max_value is not None and parsed > max_value:
                raise ValueError(f'{name} must be <= {max_value}')
            return parsed
    if default is not None:
        return default
    raise ValueError(f'missing {names[0]}')

def parse_float_field(req, names, default=0.0):
    for name in names:
        if name in req and req.get(name) not in (None, ''):
            value = req.get(name)
            if isinstance(value, str):
                value = value.strip().replace(',', '.')
                if not value:
                    continue
            try:
                return float(value)
            except Exception:
                raise ValueError(f'invalid {name}: {value!r}')
    return float(default)

def parse_month_field(req):
    value = req.get('month', req.get('birthMonth', req.get('monthIndex')))
    if value in (None, ''):
        return 1
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return 1
        lower = raw.lower()
        if lower in MONTHS:
            return MONTHS[lower]
        m = re.search(r'\d+', raw)
        if m:
            parsed = int(m.group(0))
        else:
            raise ValueError(f'invalid month: {value!r}')
    else:
        parsed = int(float(value))
    if 'monthIndex' in req and 'month' not in req and 0 <= parsed <= 11:
        parsed += 1
    if not (1 <= parsed <= 12):
        raise ValueError(f'month must be 1..12, got {parsed}')
    return parsed

def norm(x): return x % 360.0

def kepler_solve(M_rad, e):
    E = M_rad
    for _ in range(20):
        f = E - e * math.sin(E) - M_rad
        fp = 1 - e * math.cos(E)
        if abs(fp) < 1e-12:
            break
        d = f / fp
        E -= d
        if abs(d) < 1e-12:
            break
    return E

# Extended fallback only used when Swiss has no asteroid/Chiron file or a hard date limit.
# It keeps every Wheel Settings object active for all BC/AD years. Swiss is still the
# primary source; fallback positions are marked with source='extended-kepler-fallback'.
EXTENDED_ELEMENTS_J2000 = {
    # a(AU), e, i, node, perihelion longitude, mean longitude at J2000
    'Chiron': (13.64, 0.382, 6.93, 209.4, 548.7, 204.8),
    'Ceres':  (2.7675, 0.0758, 10.593, 80.305, 153.902, 249.841),
    'Pallas': (2.7730, 0.2300, 34.840, 173.100, 83.300, 116.000),
    'Juno':   (2.6700, 0.2560, 12.990, 169.900, 57.900, 60.500),
    'Vesta':  (2.3610, 0.0890, 7.140, 103.800, 254.700, 275.600),
}

GAUSS_N = 0.9856076686

def helio_xyz_from_elements(jd, elements):
    a, e, inc, node, peri_long, mean_long = elements
    d = jd - 2451545.0
    n = GAUSS_N / (a ** 1.5)
    L = norm(mean_long + n * d)
    varpi = norm(peri_long)
    M = math.radians(norm(L - varpi))
    E = kepler_solve(M, e)
    xv = a * (math.cos(E) - e)
    yv = a * (math.sqrt(max(0.0, 1 - e * e)) * math.sin(E))
    v = math.atan2(yv, xv)
    r = math.sqrt(xv * xv + yv * yv)
    arg_peri = math.radians(norm(varpi - node))
    N = math.radians(node)
    I = math.radians(inc)
    u = v + arg_peri
    xh = r * (math.cos(N) * math.cos(u) - math.sin(N) * math.sin(u) * math.cos(I))
    yh = r * (math.sin(N) * math.cos(u) + math.cos(N) * math.sin(u) * math.cos(I))
    zh = r * (math.sin(u) * math.sin(I))
    return xh, yh, zh

def earth_helio_xyz_from_sun(jd):
    # Swiss Sun geocentric vector: approximate Earth heliocentric vector by adding 180°.
    try:
        xx = swe.calc_ut(jd, swe.SUN, swe.FLG_SWIEPH | swe.FLG_SPEED)[0]
    except Exception:
        xx = swe.calc_ut(jd, swe.SUN, swe.FLG_MOSEPH | swe.FLG_SPEED)[0]
    lon = math.radians(norm(xx[0] + 180.0))
    lat = math.radians(-xx[1] if len(xx) > 1 else 0.0)
    r = xx[2] if len(xx) > 2 and xx[2] else 1.0
    return r * math.cos(lat) * math.cos(lon), r * math.cos(lat) * math.sin(lon), r * math.sin(lat)

def fallback_minor_body_position(name, jd, ayan):
    elements = EXTENDED_ELEMENTS_J2000.get(name)
    if not elements:
        raise ValueError(f'no extended fallback for {name}')
    bx, by, bz = helio_xyz_from_elements(jd, elements)
    ex, ey, ez = earth_helio_xyz_from_sun(jd)
    gx, gy, gz = bx - ex, by - ey, bz - ez
    lon = math.degrees(math.atan2(gy, gx))
    return norm(lon - ayan)

def parse_iso(s):
    if not s: raise ValueError('missing utcDate')
    s = s.replace('Z','+00:00')
    # Python datetime does not support astronomical years <= 0. For modern ISO
    # strings use datetime; for expanded signed years the caller must use raw fields.
    if re.match(r'^[+-]\d{6}-', s):
        raise ValueError('expanded astronomical ISO year requires raw fields')
    dt = datetime.datetime.fromisoformat(s)
    if dt.tzinfo is None: dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc)

def julday(dt):
    return swe.julday(dt.year, dt.month, dt.day, dt.hour + dt.minute/60 + dt.second/3600 + dt.microsecond/3.6e9, swe.GREG_CAL)

def historical_to_astronomical(year):
    y = int(year)
    # The UI accepts astronomical year 0 for users who explicitly type 0.
    # Negative typed years keep the user's BC convention: -7 = 7 BC = astronomical -6.
    if y == 0:
        return 0
    return y + 1 if y < 0 else y

def julday_from_request(req):
    # Prefer raw fields. JavaScript Date cannot reliably represent BCE years,
    # and the form may send month as text (December/Dezembro) or null.
    if any(k in req for k in ('historicalYear','year','birthYear')):
        y_raw = req.get('historicalYear', req.get('year', req.get('birthYear')))
        y = historical_to_astronomical(parse_int_field({'year': y_raw}, ['year']))
        m = parse_month_field(req)
        d = parse_int_field(req, ['day','birthDay'], default=1, min_value=1, max_value=31)
        hour = parse_float_field(req, ['hour','birthHour','hourString'], default=0)
        minute = parse_float_field(req, ['minute','birthMinute','minuteString'], default=0)
        second = parse_float_field(req, ['second'], default=0)
        offset = parse_float_field(req, ['utcOffset','utc','timezoneOffset','timezone_offset','utc_offset'], default=0)
        ut = hour - offset + minute / 60.0 + second / 3600.0
        base = swe.julday(y, m, d, 0.0, swe.GREG_CAL)
        return base + ut / 24.0
    dt = parse_iso(req.get('utcDate'))
    return julday(dt)

def point(jd, body, ayan, flags=None):
    flags = flags if flags is not None else (swe.FLG_SWIEPH | swe.FLG_SPEED)
    result = swe.calc_ut(jd, body, flags)
    # pyswisseph versions return either (xx, retflag) or just xx-like data.
    xx = result[0] if isinstance(result, tuple) and result and isinstance(result[0], (tuple, list)) else result
    pos = norm(xx[0] - ayan)
    return pos, xx[3] if len(xx) > 3 else 0

def point_with_latitude(jd, body, ayan, flags=None):
    """Return longitude in the selected zodiac, ecliptic latitude and speed."""
    flags = flags if flags is not None else (swe.FLG_SWIEPH | swe.FLG_SPEED)
    result = swe.calc_ut(jd, body, flags)
    xx = result[0] if isinstance(result, tuple) and result and isinstance(result[0], (tuple, list)) else result
    longitude = norm(float(xx[0]) - ayan)
    latitude = float(xx[1]) if len(xx) > 1 else None
    speed = float(xx[3]) if len(xx) > 3 else 0.0
    return longitude, latitude, speed

def resolve_ayanamsa(req, jd):
    zodiac = str(req.get('selectedZodiacSystem') or req.get('zodiacSystem') or 'Tropical').strip().lower()
    selected_ayanamsa = str(
        req.get('selectedAyanamsaSystem') or req.get('ayanamsaSystem') or ''
    ).strip()
    if selected_ayanamsa:
        ayanamsa_name = selected_ayanamsa.lower()
        if ayanamsa_name == 'custom':
            if req.get('customAyanamsa') in (None, ''):
                raise ValueError('customAyanamsa is required when using the Custom ayanamsa system')
            custom_value = parse_float_field(req, ['customAyanamsa'])
            if not math.isfinite(custom_value) or not -360 <= custom_value <= 360:
                raise ValueError('customAyanamsa must be a finite value between -360 and 360 degrees')
            return custom_value
        if ayanamsa_name in ('tropical', 'none'):
            return 0.0
        selected_modes = {
            'fagan/bradley': swe.SIDM_FAGAN_BRADLEY,
            'lahiri': swe.SIDM_LAHIRI,
            'deluce': swe.SIDM_DELUCE,
            'raman': swe.SIDM_RAMAN,
            'babylonian/eta piscium': swe.SIDM_BABYL_ETPSC,
            'babylonian/aldebaran = 15 tau': swe.SIDM_ALDEBARAN_15TAU,
            'galact. center = 0 sag': swe.SIDM_GALCENT_0SAG,
            'j2000': swe.SIDM_J2000,
        }
        mode = selected_modes.get(ayanamsa_name)
        if mode is None:
            raise ValueError(f'Unsupported ayanamsa system: {selected_ayanamsa}')
        swe.set_sid_mode(mode)
        return swe.get_ayanamsa_ut(jd)

    # Older clients used the zodiac field for both wheel and ayanamsa selection.
    if zodiac == '13 equal':
        swe.set_sid_mode(swe.SIDM_GALCENT_0SAG)
        return swe.get_ayanamsa_ut(jd)
    if zodiac == 'iau real constellations':
        return 0.0
    if req.get('ayanamsa') not in (None, ''):
        return parse_float_field(req, ['ayanamsa'], default=0)
    if zodiac in (
        'tropical',
        'midpoint',
        'midpoint (true sidereal)',
    ):
        return 0.0

    sidereal_modes = {
        'fagan/bradley': swe.SIDM_FAGAN_BRADLEY,
        'lahiri': swe.SIDM_LAHIRI,
        'deluce': swe.SIDM_DELUCE,
        'raman': swe.SIDM_RAMAN,
        'babylonian/eta piscium': swe.SIDM_BABYL_ETPSC,
        'babylonian/aldebaran = 15 tau': swe.SIDM_ALDEBARAN_15TAU,
        'galact. center = 0 sag': swe.SIDM_GALCENT_0SAG,
        'j2000': swe.SIDM_J2000,
    }
    mode = sidereal_modes.get(zodiac)
    if mode is None:
        raise ValueError(f'Unsupported zodiac system for Swiss Ephemeris: {req.get("selectedZodiacSystem")}')
    swe.set_sid_mode(mode)
    return swe.get_ayanamsa_ut(jd)

def calculate_payload(req):
    jd = julday_from_request(req)
    lat = parse_float_field(req, ['lat','latitude'], default=0)
    lon = parse_float_field(req, ['long','lon','longitude'], default=0)
    ayan = resolve_ayanamsa(req, jd)
    coordinate_system = str(req.get('selectedCoordinateSystem') or 'Geocentric').strip().lower()
    calculation_flags = swe.FLG_SWIEPH | swe.FLG_SPEED
    if coordinate_system == 'topocentric':
        swe.set_topo(lon, lat, 0)
        calculation_flags |= swe.FLG_TOPOCTR
    elif coordinate_system == 'heliocentric':
        calculation_flags |= swe.FLG_HELCTR
    elif coordinate_system != 'geocentric':
        raise ValueError(f'Unsupported coordinate system: {req.get("selectedCoordinateSystem")}')
    house_codes = {
        'placidus': 'P', 'equal': 'E', 'whole sign': 'W', 'koch': 'K',
        'porphyrius': 'O', 'regiomontanus': 'R', 'campanus': 'C',
    }
    selected_house = str(req.get('selectedHouseSystem') or '').strip().lower()
    house_code = str(
        req.get('houseSystemCode') or house_codes.get(selected_house) or 'P'
    )[:1].encode('ascii', 'ignore') or b'P'

    out = {"success": True, "engine": "Swiss Ephemeris / pyswisseph", "julianDay": jd, "ayanamsa": ayan, "positions": {}, "houseCusps": [], "fixedStars": []}

    bodies = {
        'Sun': swe.SUN, 'Moon': swe.MOON, 'Mercury': swe.MERCURY, 'Venus': swe.VENUS,
        'Mars': swe.MARS, 'Jupiter': swe.JUPITER, 'Saturn': swe.SATURN,
        'Uranus': swe.URANUS, 'Neptune': swe.NEPTUNE, 'Pluto': swe.PLUTO,
        'Chiron': swe.CHIRON, 'Ceres': swe.CERES, 'Pallas': swe.PALLAS,
        'Juno': swe.JUNO, 'Vesta': swe.VESTA,
    }
    if coordinate_system == 'heliocentric':
        bodies.pop('Sun')
        bodies['Earth'] = swe.EARTH
    for name, body in bodies.items():
        try:
            pos, ecliptic_latitude, speed = point_with_latitude(jd, body, ayan, calculation_flags)
            out['positions'][name] = {
                "position": pos,
                "eclipticLatitude": ecliptic_latitude,
                "speed": speed,
                "retrograde": speed < 0,
                "source": "Swiss Ephemeris",
            }
        except Exception as exc:
            # Never disable configured Wheel Settings objects. If Swiss cannot
            # compute a minor body for a very old date or missing asteroid file,
            # return an extended deterministic fallback instead of hiding it.
            try:
                pos = fallback_minor_body_position(name, jd, ayan)
                out['positions'][name] = {"position": pos, "speed": 0, "retrograde": False, "source": "extended-kepler-fallback", "swissWarning": str(exc)}
            except Exception as exc2:
                out['positions'][name] = {"position": 0.0, "speed": 0, "retrograde": False, "source": "always-enabled-fallback", "swissWarning": f"{exc}; fallback failed: {exc2}"}

    reference_point_flags = calculation_flags
    if coordinate_system == 'heliocentric':
        reference_point_flags = swe.FLG_SWIEPH | swe.FLG_SPEED
    true_node, true_node_lat, ns = point_with_latitude(jd, swe.TRUE_NODE, ayan, reference_point_flags)
    mean_node, mean_node_lat, ms = point_with_latitude(jd, swe.MEAN_NODE, ayan, reference_point_flags)
    use_true_node = req.get('trueNodes', True)
    node_speed = ns if use_true_node else ms
    node_position = true_node if use_true_node else mean_node
    node_latitude = true_node_lat if use_true_node else mean_node_lat
    out['positions']['North Node'] = {
        "position": node_position, "eclipticLatitude": node_latitude,
        "speed": node_speed, "retrograde": node_speed < 0,
    }
    out['positions']['South Node'] = {
        "position": norm(node_position+180),
        "eclipticLatitude": -node_latitude if node_latitude is not None else None,
        "speed": node_speed, "retrograde": node_speed < 0,
    }

    lil_body = swe.OSCU_APOG if req.get('trueLilith', False) else swe.MEAN_APOG
    lil, lil_latitude, ls = point_with_latitude(jd, lil_body, ayan, reference_point_flags)
    out['positions']['Lilith'] = {
        "position": lil, "eclipticLatitude": lil_latitude,
        "speed": ls, "retrograde": ls < 0,
    }
    out['positions']['Priapus'] = {
        "position": norm(lil + 180),
        "eclipticLatitude": -lil_latitude if lil_latitude is not None else None,
        "speed": ls, "retrograde": ls < 0,
    }

    # Houses and angles. Swiss houses are tropical; convert to selected sidereal zodiac by subtracting ayanamsa.
    try:
        cusps, ascmc = swe.houses_ex(jd, lat, lon, house_code, swe.FLG_SWIEPH)
    except Exception:
        cusps, ascmc = swe.houses_ex(jd, lat, lon, b'P', swe.FLG_SWIEPH)
    def cusp_position(c):
        return norm(c - ayan)

    asc_pos = cusp_position(ascmc[0])
    if house_code in (b'W', b'E'):
        # Do not rely on Swiss' optional W/E implementation. Whole Sign starts
        # at 0 degrees of the rising sign; Equal starts at the exact Ascendant.
        first_cusp = norm((int(asc_pos // 30) * 30) if house_code == b'W' else asc_pos)
        out['houseCusps'] = [
            {"house": i + 1, "position": norm(first_cusp + i * 30)}
            for i in range(12)
        ]
    else:
        out['houseCusps'] = [
            {"house": i, "position": cusp_position(c)}
            for i, c in enumerate(cusps, start=1)
        ]
    house_anchor = {item['house']: item['position'] for item in out['houseCusps']}

    def anchored_angle(position, house_number):
        # Keep the real astronomical angle in `position`, but provide an explicit
        # render anchor so the frontend can glue ASC/DS/IC/MC to House 1/7/4/10
        # for every house system, including Whole Sign and Equal variants where
        # MC/IC are not necessarily the 10th/4th cusps.
        return {
            "position": norm(position),
            "eclipticLatitude": 0.0,
            "houseAnchorPosition": norm(house_anchor.get(house_number, position)),
            "houseAnchorHouse": house_number,
        }

    mc_pos = cusp_position(ascmc[1])
    vertex_pos = cusp_position(ascmc[3])
    out['positions']['Ascendant Symbol'] = anchored_angle(asc_pos, 1)
    out['positions']['Midheaven'] = anchored_angle(mc_pos, 10)
    out['positions']['Descendant'] = anchored_angle(norm(asc_pos + 180), 7)
    out['positions']['Imum Coeli'] = anchored_angle(norm(mc_pos + 180), 4)
    out['positions']['Vertex'] = {"position": vertex_pos, "eclipticLatitude": 0.0}
    out['positions']['Anti-Vertex'] = {"position": norm(vertex_pos + 180), "eclipticLatitude": 0.0}

    # Arabic parts must be recomputed from the final Swiss Sun/Moon/ASC.
    sun = out['positions'].get('Sun', {}).get('position')
    moon = out['positions'].get('Moon', {}).get('position')
    if isinstance(sun, (int, float)) and isinstance(moon, (int, float)):
        # Day formula used by the user's reference charts:
        # Fortune = ASC + Moon - Sun, Spirit = ASC + Sun - Moon.
        out['positions']['Part of Fortune'] = {"position": norm(asc_pos + moon - sun), "eclipticLatitude": 0.0, "source": "Derived ecliptic point"}
        out['positions']['Part of Spirit'] = {"position": norm(asc_pos + sun - moon), "eclipticLatitude": 0.0, "source": "Derived ecliptic point"}

    # Sagittarius A*/Galactic Centre from Swiss fixed-star catalogue only.
    # No fabricated fallback: if Swiss cannot return it for the requested date,
    # the frontend must show it as unavailable instead of inventing a longitude.
    try:
        star_result = swe.fixstar2_ut('Gal. Center', jd, swe.FLG_SWIEPH | swe.FLG_SPEED)
        star = star_result[0] if isinstance(star_result, tuple) and star_result and isinstance(star_result[0], (tuple, list)) else star_result
        gc_pos = norm(star[0] - ayan)
        out['positions']['Galactic Center'] = {"position": gc_pos, "eclipticLatitude": float(star[1]), "source": "Swiss fixstar2_ut"}
    except Exception as exc:
        # Keep Centro Galáctico enabled for every historical date. This constant
        # is the standard tropical Sagittarius A* region, used only if the Swiss
        # fixed-star catalogue cannot answer.
        gc_fallback = norm(266.41683 - ayan)
        out['positions']['Galactic Center'] = {"position": gc_fallback, "source": "fallback-galactic-center", "swissWarning": str(exc)}

    if req.get('fixedStars') is True:
        magnitude_limit = parse_float_field(req, ['fixedStarsMagnitude'], default=2.0)
        latitude_limit = parse_float_field(req, ['fixedStarsLatitude'], default=30.0)
        if magnitude_limit < -2 or magnitude_limit > 10:
            raise ValueError('fixedStarsMagnitude must be between -2 and 10')
        if latitude_limit < 0 or latitude_limit > 90:
            raise ValueError('fixedStarsLatitude must be between 0 and 90')
        catalog_path = os.path.join(ROOT, 'json', 'fixedStars.json')
        with open(catalog_path, 'r', encoding='utf-8') as catalog_file:
            fixed_star_catalog = json.load(catalog_file)
        for catalog_star in fixed_star_catalog:
            magnitude = float(catalog_star['magnitude'])
            if magnitude > magnitude_limit:
                continue
            try:
                star_result = swe.fixstar2_ut(
                    str(catalog_star['name']),
                    jd,
                    swe.FLG_SWIEPH | swe.FLG_SPEED,
                )
            except Exception as exc:
                raise ValueError(
                    f"Swiss Ephemeris could not calculate fixed star "
                    f"{catalog_star['name']}: {exc}"
                ) from exc
            star = star_result[0]
            ecliptic_latitude = float(star[1])
            if abs(ecliptic_latitude) > latitude_limit:
                continue
            out['fixedStars'].append({
                "name": catalog_star['name'],
                "position": norm(float(star[0]) - ayan),
                "eclipticLatitude": ecliptic_latitude,
                "magnitude": magnitude,
                "speed": float(star[3]),
                "source": "Swiss Ephemeris fixed-star catalog",
            })

    return out

def calculate_return_date(req):
    natal_data = req.get('natalData')
    if isinstance(natal_data, list):
        natal = natal_data[0] if natal_data else {}
    elif isinstance(natal_data, dict):
        natal = natal_data
    else:
        natal = {}
    return_type = str(req.get('returnType') or 'Solar').strip().lower()
    return_bodies = {
        'solar': ('Sun', swe.SUN, 365.256),
        'lunar': ('Moon', swe.MOON, 27.3217),
        'mercury': ('Mercury', swe.MERCURY, 365.256),
        'venus': ('Venus', swe.VENUS, 224.701),
        'mars': ('Mars', swe.MARS, 686.98),
        'jupiter': ('Jupiter', swe.JUPITER, 4332.59),
        'saturn': ('Saturn', swe.SATURN, 10759.2),
    }
    if return_type not in return_bodies:
        raise ValueError(f'Unsupported return type: {req.get("returnType")}')

    offset = parse_int_field(req, ['returnOffset'], default=0)
    body_name, body_id, approximate_period = return_bodies[return_type]
    coordinate_system = str(req.get('selectedCoordinateSystem') or 'Geocentric').strip().lower()
    if coordinate_system == 'heliocentric' and body_name == 'Sun':
        body_name, body_id = 'Earth', swe.EARTH

    natal_req = {
        **natal,
        'selectedZodiacSystem': req.get('selectedZodiacSystem') or natal.get('zodiacSystem') or 'Tropical',
        'selectedAyanamsaSystem': req.get('selectedAyanamsaSystem') or natal.get('ayanamsaSystem') or 'Tropical',
        'customAyanamsa': req.get('customAyanamsa', natal.get('customAyanamsa')),
        'selectedHouseSystem': req.get('selectedHouseSystem') or natal.get('houseSystem') or 'Placidus',
        'selectedCoordinateSystem': req.get('selectedCoordinateSystem') or natal.get('coordinateSystem') or 'Geocentric',
        'fixedStars': False,
    }
    natal_chart = calculate_payload(natal_req)
    natal_body = natal_chart['positions'].get(body_name)
    if not natal_body or not isinstance(natal_body.get('position'), (int, float)):
        raise ValueError(f'Could not calculate natal {body_name} position for this return.')
    target_position = norm(float(natal_body['position']))

    latitude = parse_float_field(req, ['lat', 'latitude'], default=0)
    longitude = parse_float_field(req, ['long', 'lon', 'longitude'], default=0)
    flags = swe.FLG_SWIEPH | swe.FLG_SPEED
    if coordinate_system == 'topocentric':
        swe.set_topo(longitude, latitude, 0)
        flags |= swe.FLG_TOPOCTR
    elif coordinate_system == 'heliocentric':
        flags |= swe.FLG_HELCTR
    elif coordinate_system != 'geocentric':
        raise ValueError(f'Unsupported coordinate system: {req.get("selectedCoordinateSystem")}')

    def position_at(jd):
        ayan = resolve_ayanamsa(req, jd)
        return point(jd, body_id, ayan, flags)[0]

    def signed_delta(from_position, to_position):
        return ((to_position - from_position + 180.0) % 360.0) - 180.0

    direction = -1 if offset <= 0 else 1
    crossings_needed = abs(offset) + (1 if offset <= 0 else 0)
    if offset == 0:
        crossings_needed = 1

    now = datetime.datetime.now(datetime.timezone.utc)
    start_jd = julday(now)
    previous_jd = start_jd
    previous_position = position_at(previous_jd)
    unwrapped_position = previous_position
    crossing_count = 0
    return_jd = None
    step_days = 1.0
    max_days = approximate_period * (crossings_needed + 2)
    max_steps = int(math.ceil(max_days / step_days))

    for _ in range(max_steps):
        current_jd = previous_jd + direction * step_days
        current_position = position_at(current_jd)
        current_unwrapped = unwrapped_position + signed_delta(previous_position, current_position)
        lower = min(unwrapped_position, current_unwrapped)
        upper = max(unwrapped_position, current_unwrapped)
        first_turn = math.floor((lower - target_position) / 360.0) - 1
        last_turn = math.ceil((upper - target_position) / 360.0) + 1
        crossed_levels = [
            target_position + 360.0 * turn
            for turn in range(first_turn, last_turn + 1)
            if lower - 1e-10 <= target_position + 360.0 * turn <= upper + 1e-10
            and abs((target_position + 360.0 * turn) - unwrapped_position) > 1e-10
        ]
        if current_unwrapped < unwrapped_position:
            crossed_levels.reverse()

        for level in crossed_levels:
            low_jd = min(previous_jd, current_jd)
            high_jd = max(previous_jd, current_jd)
            low_unwrapped = (
                unwrapped_position if previous_jd < current_jd else current_unwrapped
            )
            low_delta = low_unwrapped - level
            for _ in range(40):
                middle_jd = (low_jd + high_jd) / 2.0
                middle_position = position_at(middle_jd)
                middle_unwrapped = unwrapped_position + signed_delta(previous_position, middle_position)
                middle_delta = middle_unwrapped - level
                if (low_delta <= 0 <= middle_delta) or (middle_delta <= 0 <= low_delta):
                    high_jd = middle_jd
                else:
                    low_jd = middle_jd
                    low_delta = middle_delta
                if high_jd - low_jd < 0.5 / 86400.0:
                    break
            crossing_count += 1
            if crossing_count == crossings_needed:
                return_jd = (low_jd + high_jd) / 2.0
                break
        if return_jd is not None:
            break

        previous_jd = current_jd
        previous_position = current_position
        unwrapped_position = current_unwrapped

    if return_jd is None:
        raise ValueError(f'No {body_name} return crossing found in the supported date range.')

    year, month, day, decimal_hour = swe.revjul(return_jd, swe.GREG_CAL)
    seconds = int(round((decimal_hour % 24.0) * 3600.0))
    utc_date = (
        datetime.datetime(year, month, day, tzinfo=datetime.timezone.utc)
        + datetime.timedelta(seconds=seconds)
    )

    if str(req.get('utcMode') or '').lower() == 'manual':
        offset_hours = parse_float_field(req, ['utcOffset'], default=0)
        local_zone = datetime.timezone(datetime.timedelta(hours=offset_hours))
    else:
        timezone_name = str(req.get('timezone') or natal.get('timezone') or '')
        try:
            local_zone = ZoneInfo(timezone_name) if timezone_name else datetime.timezone.utc
        except Exception:
            offset_hours = parse_float_field(req, ['utcOffset'], default=0)
            local_zone = datetime.timezone(datetime.timedelta(hours=offset_hours))
    local_date = utc_date.astimezone(local_zone)

    return {
        'success': True,
        'returnType': return_type.title(),
        'targetLongitude': target_position,
        'returnDate': utc_date.isoformat().replace('+00:00', 'Z'),
        'localDateTime': {
            'year': local_date.year,
            'month': local_date.month,
            'day': local_date.day,
            'hour': local_date.hour,
            'minute': local_date.minute,
        },
    }

def calculate_astrocartography(req):
    jd = julday_from_request(req)
    true_nodes = req.get('trueNodes', True)
    true_lilith = req.get('trueLilith', False)
    coordinate_system = str(
        req.get('selectedCoordinateSystem') or req.get('coordinateSystem') or 'Geocentric'
    ).strip().lower()
    reference_flags = swe.FLG_SWIEPH | swe.FLG_EQUATORIAL
    planet_flags = reference_flags
    if coordinate_system == 'heliocentric':
        planet_flags |= swe.FLG_HELCTR

    body_ids = {
        'Sun': swe.SUN, 'Moon': swe.MOON, 'Mercury': swe.MERCURY,
        'Venus': swe.VENUS, 'Mars': swe.MARS, 'Jupiter': swe.JUPITER,
        'Saturn': swe.SATURN, 'Uranus': swe.URANUS, 'Neptune': swe.NEPTUNE,
        'Pluto': swe.PLUTO, 'Chiron': swe.CHIRON, 'Ceres': swe.CERES,
        'Pallas': swe.PALLAS, 'Juno': swe.JUNO, 'Vesta': swe.VESTA,
        'Earth': swe.EARTH,
    }
    requested_planets = req.get('planets')
    if not isinstance(requested_planets, list):
        raise ValueError('planets must be a list')

    def equatorial(body, calculation_flags=planet_flags):
        result = swe.calc_ut(jd, body, calculation_flags)
        coordinates = result[0] if isinstance(result, tuple) and result and isinstance(result[0], (tuple, list)) else result
        return norm(coordinates[0]), float(coordinates[1])

    node_id = swe.TRUE_NODE if true_nodes else swe.MEAN_NODE
    lilith_id = swe.OSCU_APOG if true_lilith else swe.MEAN_APOG
    positions = {}
    output_planets = []
    for requested_name in requested_planets:
        name = str(requested_name)
        canonical = {
            'True_Node': 'North Node',
            'North Node': 'North Node',
            'South Node': 'South Node',
            'Lilith': 'Lilith',
            'Priapus': 'Priapus',
        }.get(name, name)

        if canonical in ('North Node', 'South Node'):
            ra, dec = positions.get('North Node') or equatorial(node_id, reference_flags)
            positions['North Node'] = (ra, dec)
            if canonical == 'South Node':
                ra, dec = norm(ra + 180.0), -dec
        elif canonical in ('Lilith', 'Priapus'):
            ra, dec = positions.get('Lilith') or equatorial(lilith_id, reference_flags)
            positions['Lilith'] = (ra, dec)
            if canonical == 'Priapus':
                ra, dec = norm(ra + 180.0), -dec
        else:
            body = body_ids.get(canonical)
            if body is None or (canonical == 'Sun' and coordinate_system == 'heliocentric'):
                continue
            if canonical == 'Earth' and coordinate_system != 'heliocentric':
                continue
            ra, dec = equatorial(body)

        output_planets.append({
            'name': name,
            'ra': ra,
            'dec': dec,
        })

    zodiac = str(req.get('selectedZodiacSystem') or req.get('zodiacSystem') or 'Tropical')
    ayanamsa = resolve_ayanamsa(req, jd)
    zodiac_key = zodiac.strip().lower()
    if zodiac_key == 'midpoint':
        signs = [
            {'name': name, 'sidLon': start}
            for name, start in [
                ('Aries', 0), ('Taurus', 19.7267), ('Gemini', 56.5838),
                ('Cancer', 86.0378), ('Leo', 103.1872), ('Virgo', 141.6068),
                ('Libra', 191.3253), ('Scorpio', 210.2037),
                ('Ophiuchus', 223.4316), ('Sagittarius', 235.7895),
                ('Capricorn', 269.1806), ('Aquarius', 294.8496),
                ('Pisces', 318.0143),
            ]
        ]
    elif zodiac_key == '13 equal':
        equal_signs = [
            'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
            'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius',
            'Pisces', 'Ophiuchus',
        ]
        signs = [
            {
                'name': name,
                'sidLon': (240 + (index - 8) * (360 / len(equal_signs))) % 360,
            }
            for index, name in enumerate(equal_signs)
        ]
    else:
        signs = [{'name': name, 'sidLon': start} for name, start in SIGNS.items()]
    return {
        'success': True,
        'gmst': norm(swe.sidtime(jd) * 15.0),
        'lat': parse_float_field(req, ['lat', 'latitude'], default=0),
        'lon': parse_float_field(req, ['long', 'lon', 'longitude'], default=0),
        'planets': output_planets,
        'zodiac': {'ayanamsa': ayanamsa, 'signs': signs, 'system': zodiac},
    }

GRAPH_ASPECT_ANGLES = {
    'conjunction': ('Conjunction', 0.0, 8.0),
    'opposition': ('Opposition', 180.0, 8.0),
    'square': ('Square', 90.0, 6.0),
    'trine': ('Trine', 120.0, 6.0),
    'sextile': ('Sextile', 60.0, 4.0),
    'semisextile': ('Semisextile', 30.0, 2.0),
    'quincunx': ('Quincunx', 150.0, 2.0),
}

GRAPH_BODY_IDS = {
    'Sun': swe.SUN, 'Moon': swe.MOON, 'Mercury': swe.MERCURY,
    'Venus': swe.VENUS, 'Mars': swe.MARS, 'Jupiter': swe.JUPITER,
    'Saturn': swe.SATURN, 'Uranus': swe.URANUS, 'Neptune': swe.NEPTUNE,
    'Pluto': swe.PLUTO, 'Chiron': swe.CHIRON, 'Ceres': swe.CERES,
    'Pallas': swe.PALLAS, 'Juno': swe.JUNO, 'Vesta': swe.VESTA,
    'Earth': swe.EARTH,
}

GRAPH_PLANET_ALIASES = {
    'True_Node': 'North Node',
    'Ascendant_Symbol': 'Ascendant Symbol',
}

def graph_positions_at_jd(jd, names, req):
    ayan = resolve_ayanamsa(req, jd)
    coordinate_system = str(req.get('selectedCoordinateSystem') or 'Geocentric').strip().lower()
    flags = swe.FLG_SWIEPH | swe.FLG_SPEED
    if coordinate_system == 'topocentric':
        swe.set_topo(
            parse_float_field(req, ['long', 'lon', 'longitude'], default=0),
            parse_float_field(req, ['lat', 'latitude'], default=0),
            0,
        )
        flags |= swe.FLG_TOPOCTR
    elif coordinate_system == 'heliocentric':
        flags |= swe.FLG_HELCTR
    elif coordinate_system != 'geocentric':
        raise ValueError(f'Unsupported coordinate system: {req.get("selectedCoordinateSystem")}')

    result = {}
    node_id = swe.TRUE_NODE if req.get('trueNodes', True) else swe.MEAN_NODE
    lilith_id = swe.OSCU_APOG if req.get('trueLilith', False) else swe.MEAN_APOG
    for requested_name in names:
        name = GRAPH_PLANET_ALIASES.get(str(requested_name), str(requested_name))
        try:
            if name in ('North Node', 'South Node'):
                position, speed = point(jd, node_id, ayan, swe.FLG_SWIEPH | swe.FLG_SPEED)
                if name == 'South Node':
                    position = norm(position + 180.0)
            elif name in ('Lilith', 'Priapus'):
                position, speed = point(jd, lilith_id, ayan, swe.FLG_SWIEPH | swe.FLG_SPEED)
                if name == 'Priapus':
                    position = norm(position + 180.0)
            elif name in ('Ascendant Symbol', 'Midheaven'):
                lat = parse_float_field(req, ['lat', 'latitude'], default=0)
                lon = parse_float_field(req, ['long', 'lon', 'longitude'], default=0)
                house_codes = {
                    'placidus': 'P', 'equal': 'E', 'whole sign': 'W',
                    'koch': 'K', 'porphyrius': 'O', 'regiomontanus': 'R',
                    'campanus': 'C',
                }
                house_name = str(req.get('selectedHouseSystem') or 'Placidus').lower()
                house_code = house_codes.get(house_name, 'P').encode('ascii')
                try:
                    _, angles = swe.houses_ex(jd, lat, lon, house_code, swe.FLG_SWIEPH)
                except Exception:
                    _, angles = swe.houses_ex(jd, lat, lon, b'P', swe.FLG_SWIEPH)
                position = angles[0] if name == 'Ascendant Symbol' else angles[1]
                position = norm(position - ayan)
                speed = 0.0
            else:
                body = GRAPH_BODY_IDS.get(name)
                if body is None or (name == 'Sun' and coordinate_system == 'heliocentric'):
                    continue
                if name == 'Earth' and coordinate_system != 'heliocentric':
                    continue
                position, speed = point(jd, body, ayan, flags)
        except Exception as exc:
            try:
                position = fallback_minor_body_position(name, jd, ayan)
                speed = 0.0
            except Exception:
                raise ValueError(f'Unable to calculate {requested_name}: {exc}') from exc
        result[str(requested_name)] = (position, speed)
    return result

def graph_date_jd(req, prefix, utc_offset):
    date_req = {
        'year': parse_int_field(req, [prefix + 'Year'], min_value=-9999, max_value=9999),
        'month': req.get(prefix + 'Month'),
        'day': parse_int_field(req, [prefix + 'Day'], min_value=1, max_value=31),
        'hour': parse_float_field(req, [prefix + 'Hour'], default=0),
        'minute': parse_float_field(req, [prefix + 'Minute'], default=0),
        'utcOffset': utc_offset,
    }
    return julday_from_request(date_req)

def graph_date_payload(jd, utc_offset):
    year, month, day, hour = swe.revjul(jd + utc_offset / 24.0, swe.GREG_CAL)
    total_seconds = round(hour * 3600.0)
    return {
        'year': year,
        'month': month,
        'day': day,
        'hour': (total_seconds // 3600) % 24,
        'minute': (total_seconds % 3600) // 60,
        'second': total_seconds % 60,
    }

def graph_aspect_events(jds, first_positions, second_positions, first_names, second_names,
                        aspect_names, orb_settings, utc_offset, first_field, second_field):
    aspects = []
    for first_name in first_names:
        for second_name in second_names:
            if (
                first_positions is second_positions
                and first_names is second_names
                and first_names.index(first_name) >= first_names.index(second_name)
            ):
                continue
            first_track = [positions.get(first_name) for positions in first_positions]
            second_track = [positions.get(second_name) for positions in second_positions]
            if any(first is None for first in first_track) or any(second is None for second in second_track):
                continue
            for aspect_key in aspect_names:
                config = GRAPH_ASPECT_ANGLES.get(str(aspect_key).lower())
                if not config:
                    continue
                aspect_name, angle, default_orb = config
                configured_orb = (orb_settings or {}).get(aspect_name)
                if configured_orb is None:
                    configured_orb = (orb_settings or {}).get(str(aspect_key))
                try:
                    orb = float(configured_orb) if configured_orb is not None else default_orb
                except (TypeError, ValueError):
                    orb = default_orb
                if not math.isfinite(orb) or orb <= 0:
                    continue

                errors = []
                relative_positions = []
                for first, second in zip(first_track, second_track):
                    relative_positions.append((first[0] - second[0]) % 360.0)
                    separation = abs((relative_positions[-1] + 180.0) % 360.0 - 180.0)
                    errors.append(separation - angle)

                unwrapped = [relative_positions[0]]
                for relative in relative_positions[1:]:
                    delta = (relative - unwrapped[-1] + 180.0) % 360.0 - 180.0
                    unwrapped.append(unwrapped[-1] + delta)
                exact_times = set()
                targets = {angle % 360.0, (-angle) % 360.0}
                for target in targets:
                    for sample_index in range(len(jds) - 1):
                        left, right = unwrapped[sample_index:sample_index + 2]
                        low, high = sorted((left, right))
                        first_turn = math.ceil((low - target) / 360.0)
                        last_turn = math.floor((high - target) / 360.0)
                        for turn in range(first_turn, last_turn + 1):
                            target_position = target + turn * 360.0
                            if left == right or not low <= target_position <= high:
                                continue
                            fraction = (target_position - left) / (right - left)
                            exact_times.add(
                                jds[sample_index] +
                                (jds[sample_index + 1] - jds[sample_index]) * fraction
                            )

                inside = [abs(error) <= orb for error in errors]
                index = 0
                transits = []
                while index < len(jds):
                    if not inside[index]:
                        index += 1
                        continue
                    first_inside = index
                    while index + 1 < len(jds) and inside[index + 1]:
                        index += 1
                    last_inside = index
                    if first_inside == 0:
                        start_jd = jds[first_inside]
                    else:
                        before, current = abs(errors[first_inside - 1]), abs(errors[first_inside])
                        fraction = (orb - before) / (current - before) if current != before else 0.0
                        start_jd = jds[first_inside - 1] + (jds[first_inside] - jds[first_inside - 1]) * fraction
                    if last_inside == len(jds) - 1:
                        end_jd = jds[last_inside]
                    else:
                        current, after = abs(errors[last_inside]), abs(errors[last_inside + 1])
                        fraction = (orb - current) / (after - current) if after != current else 0.0
                        end_jd = jds[last_inside] + (jds[last_inside + 1] - jds[last_inside]) * fraction

                    closest_error = min(
                        abs(errors[item])
                        for item in range(first_inside, last_inside + 1)
                    )
                    contacts = [(start_jd, 'start', round(closest_error, 3))]
                    contacts.extend(
                        (exact_jd, 'exact', 0.0)
                        for exact_jd in sorted(exact_times)
                        if start_jd - 1e-8 <= exact_jd <= end_jd + 1e-8
                    )
                    if end_jd > start_jd + 1e-8:
                        contacts.append((end_jd, 'end', round(closest_error, 3)))
                    for contact_jd, contact, contact_orb in contacts:
                        transits.append({
                            'date': graph_date_payload(contact_jd, utc_offset),
                            'contact': contact,
                            'orb': contact_orb,
                        })
                    index += 1

                if transits:
                    item = {'type': aspect_name, 'transits': transits}
                    item[first_field] = first_name
                    item[second_field] = second_name
                    aspects.append(item)
    return aspects

def graph_station_events(jds, positions, planet_names, utc_offset, planet_field):
    grouped = {}
    for name in planet_names:
        track = [sample.get(name) for sample in positions]
        for index in range(len(track) - 1):
            if track[index] is None or track[index + 1] is None:
                continue
            before_speed, after_speed = track[index][1], track[index + 1][1]
            if before_speed == 0 or after_speed == 0 or before_speed * after_speed > 0:
                continue
            station_type = 'Direct' if before_speed < 0 else 'Retrograde'
            fraction = abs(before_speed) / (abs(before_speed) + abs(after_speed))
            jd = jds[index] + (jds[index + 1] - jds[index]) * fraction
            key = (name, station_type)
            grouped.setdefault(key, []).append({
                'date': graph_date_payload(jd, utc_offset),
                'contact': 'exact',
                'orb': 0,
            })
    return [
        {'type': station_type, planet_field: name, 'transits': transits}
        for (name, station_type), transits in grouped.items()
    ]

def graph_sign_name(position, req):
    names = list(SIGNS)
    system = str(req.get('selectedZodiacSystem') or 'Tropical').strip().lower()
    if system == 'midpoint':
        boundaries = [
            ('Aries', 0), ('Taurus', 19.7267), ('Gemini', 56.5838),
            ('Cancer', 86.0378), ('Leo', 103.1872), ('Virgo', 141.6068),
            ('Libra', 191.3253), ('Scorpio', 210.2037),
            ('Ophiuchus', 223.4316), ('Sagittarius', 235.7895),
            ('Capricorn', 269.1806), ('Aquarius', 294.8496), ('Pisces', 318.0143),
        ]
        return next(
            (name for name, boundary in reversed(boundaries) if position >= boundary),
            boundaries[-1][0],
        )
    if system == '13 equal':
        equal_names = names[:8] + ['Ophiuchus'] + names[8:]
        boundaries = [
            (240.0 + (index - 8) * (360.0 / 13.0)) % 360.0
            for index in range(13)
        ]
        order = sorted(range(13), key=lambda item: boundaries[item], reverse=True)
        return next(
            (equal_names[index] for index in order if position >= boundaries[index]),
            equal_names[order[0]],
        )
    return names[min(int(position // 30.0), 11)]

def graph_sign_ingress_events(jds, positions, planet_names, req, utc_offset, planet_field):
    grouped = {}
    for name in planet_names:
        track = [sample.get(name) for sample in positions]
        for index in range(len(track) - 1):
            if track[index] is None or track[index + 1] is None:
                continue
            old_sign = graph_sign_name(track[index][0], req)
            new_sign = graph_sign_name(track[index + 1][0], req)
            if old_sign == new_sign:
                continue
            delta = (track[index + 1][0] - track[index][0] + 180.0) % 360.0 - 180.0
            low, high = 0.0, 1.0
            for _ in range(24):
                fraction = (low + high) / 2.0
                position = norm(track[index][0] + delta * fraction)
                if graph_sign_name(position, req) == old_sign:
                    low = fraction
                else:
                    high = fraction
            fraction = (low + high) / 2.0
            key = (name, new_sign)
            grouped.setdefault(key, []).append({
                'date': graph_date_payload(
                    jds[index] + (jds[index + 1] - jds[index]) * fraction,
                    utc_offset,
                ),
                'contact': 'exact',
                'orb': 0,
            })
    return [
        {
            'type': 'Ingress',
            planet_field: name,
            'natalPlanet': sign,
            'transits': transits,
        }
        for (name, sign), transits in grouped.items()
    ]

def graph_house_number(position, cusps):
    for index, cusp in enumerate(cusps):
        next_cusp = cusps[(index + 1) % len(cusps)]
        distance = (position - cusp) % 360.0
        house_width = (next_cusp - cusp) % 360.0
        if distance < house_width:
            return index + 1
    return 12

def graph_natal_house_cusps(jd, req):
    lat = parse_float_field(req, ['lat', 'latitude'], default=0)
    lon = parse_float_field(req, ['long', 'lon', 'longitude'], default=0)
    house_codes = {
        'placidus': 'P', 'equal': 'E', 'whole sign': 'W',
        'koch': 'K', 'porphyrius': 'O', 'regiomontanus': 'R',
        'campanus': 'C',
    }
    house_name = str(req.get('selectedHouseSystem') or 'Placidus').strip().lower()
    house_code = house_codes.get(house_name, 'P').encode('ascii')
    try:
        cusps, angles = swe.houses_ex(jd, lat, lon, house_code, swe.FLG_SWIEPH)
    except Exception:
        cusps, angles = swe.houses_ex(jd, lat, lon, b'P', swe.FLG_SWIEPH)
    ayan = resolve_ayanamsa(req, jd)
    ascendant = norm(angles[0] - ayan)
    if house_code in (b'W', b'E'):
        first = norm((int(ascendant // 30) * 30) if house_code == b'W' else ascendant)
        return [norm(first + index * 30.0) for index in range(12)]
    return [norm(cusp - ayan) for cusp in cusps]

def graph_house_ingress_events(jds, positions, planet_names, cusps, utc_offset, planet_field):
    grouped = {}
    for name in planet_names:
        track = [sample.get(name) for sample in positions]
        for index in range(len(track) - 1):
            if track[index] is None or track[index + 1] is None:
                continue
            old_house = graph_house_number(track[index][0], cusps)
            new_house = graph_house_number(track[index + 1][0], cusps)
            if old_house == new_house:
                continue
            delta = (track[index + 1][0] - track[index][0] + 180.0) % 360.0 - 180.0
            low, high = 0.0, 1.0
            for _ in range(24):
                fraction = (low + high) / 2.0
                position = norm(track[index][0] + delta * fraction)
                if graph_house_number(position, cusps) == old_house:
                    low = fraction
                else:
                    high = fraction
            fraction = (low + high) / 2.0
            key = (name, new_house)
            grouped.setdefault(key, []).append({
                'date': graph_date_payload(
                    jds[index] + (jds[index + 1] - jds[index]) * fraction,
                    utc_offset,
                ),
                'contact': 'exact',
                'orb': 0,
            })
    return [
        {
            'type': 'Ingress',
            planet_field: name,
            'transitingPlanet2': f'House {house}',
            'transits': transits,
        }
        for (name, house), transits in grouped.items()
    ]

def calculate_transit_graph(req):
    natal = req.get('natalData')
    if isinstance(natal, list):
        natal = natal[0] if natal else None
    if not isinstance(natal, dict):
        raise ValueError('Transit Graph requires natal chart data. Calculate a natal chart first.')

    utc_offset = parse_float_field(natal, ['utcOffset', 'utc', 'timezoneOffset'], default=0)
    start_jd = graph_date_jd(req, 'start', utc_offset)
    end_jd = graph_date_jd(req, 'end', utc_offset)
    if end_jd <= start_jd:
        raise ValueError('Transit Graph end date must be after the start date.')
    duration = end_jd - start_jd
    if duration > 20 * 365.25:
        raise ValueError('Transit Graph date range cannot exceed 20 years.')

    selected_transit = [str(name) for name in req.get('selectedPlanetsTransit', [])]
    selected_progressed = [str(name) for name in req.get('selectedPlanetsProgressed', [])]
    selected_natal = [str(name) for name in req.get('selectedPlanetsNatal', [])]
    type_settings = set(req.get('selectedTransitingTypes') or [])
    aspect_names = req.get('selectedTransitingAspects') or []
    if not isinstance(aspect_names, list):
        raise ValueError('selectedTransitingAspects must be a list.')

    natal_req = {
        **natal,
        'selectedZodiacSystem': req.get('selectedZodiacSystem') or natal.get('zodiacSystem') or 'Tropical',
        'selectedAyanamsaSystem': req.get('selectedAyanamsaSystem') or natal.get('ayanamsaSystem') or 'Tropical',
        'customAyanamsa': req.get('customAyanamsa', natal.get('customAyanamsa')),
        'selectedHouseSystem': req.get('selectedHouseSystem') or natal.get('houseSystem') or 'Placidus',
        'selectedCoordinateSystem': req.get('selectedCoordinateSystem') or natal.get('coordinateSystem') or 'Geocentric',
    }
    natal_jd = julday_from_request(natal_req)
    natal_positions = graph_positions_at_jd(
        natal_jd,
        [*selected_natal, *selected_progressed],
        natal_req,
    )

    step = 0.5 if 'Moon' in selected_transit or 'Moon' in selected_progressed else 1.0
    sample_count = max(1, int(math.ceil(duration / step)))
    jds = [start_jd + min(index * step, duration) for index in range(sample_count + 1)]
    if jds[-1] < end_jd:
        jds.append(end_jd)

    transit_positions = [
        graph_positions_at_jd(jd, selected_transit, natal_req)
        for jd in jds
    ]
    progressed_positions = [
        graph_positions_at_jd(
            natal_jd + (jd - natal_jd) / 365.2422,
            selected_progressed,
            natal_req,
        )
        for jd in jds
    ]

    aspects = []
    aspect_types = [
        ('Transiting to Natal', selected_transit, selected_natal,
         transit_positions, [natal_positions] * len(jds), 'transitingPlanet', 'natalPlanet'),
        ('Transiting to Transiting', selected_transit, selected_transit,
         transit_positions, transit_positions, 'transitingPlanet', 'transitingPlanet2'),
        ('Progressed to Natal', selected_progressed, selected_natal,
         progressed_positions, [natal_positions] * len(jds), 'progressedPlanet', 'natalPlanet'),
        ('Progressed to Progressed', selected_progressed, selected_progressed,
         progressed_positions, progressed_positions, 'progressedPlanet', 'progressedPlanet2'),
    ]
    for type_name, first_names, second_names, first_positions, second_positions, first_field, second_field in aspect_types:
        if type_name not in type_settings:
            continue
        aspects.extend(graph_aspect_events(
            jds,
            first_positions,
            second_positions,
            first_names,
            second_names,
            aspect_names,
            req.get('graphAspectOrbs'),
            utc_offset,
            first_field,
            second_field,
        ))

    if 'Stations' in type_settings:
        aspects.extend(graph_station_events(
            jds, transit_positions, selected_transit, utc_offset, 'transitingPlanet'
        ))
    if 'Progressed Stations' in type_settings:
        aspects.extend(graph_station_events(
            jds, progressed_positions, selected_progressed, utc_offset, 'progressedPlanet'
        ))
    if 'Sign Ingresses' in type_settings:
        aspects.extend(graph_sign_ingress_events(
            jds, transit_positions, selected_transit, req, utc_offset, 'transitingPlanet'
        ))
        aspects.extend(graph_sign_ingress_events(
            jds, progressed_positions, selected_progressed, req, utc_offset, 'progressedPlanet'
        ))
    if 'House Ingresses' in type_settings:
        natal_cusps = graph_natal_house_cusps(natal_jd, natal_req)
        aspects.extend(graph_house_ingress_events(
            jds, transit_positions, selected_transit, natal_cusps, utc_offset, 'transitingPlanet'
        ))
        aspects.extend(graph_house_ingress_events(
            jds, progressed_positions, selected_progressed, natal_cusps, utc_offset, 'progressedPlanet'
        ))

    return {
        'success': True,
        'engine': 'Swiss Ephemeris / pyswisseph',
        'aspects': aspects,
    }

def main():
    req = json.loads(sys.stdin.read() or '{}')
    if req.get('action') == 'transit-graph':
        print(json.dumps(calculate_transit_graph(req)))
        return
    if req.get('action') == 'astrocartography':
        print(json.dumps(calculate_astrocartography(req)))
        return
    if req.get('action') == 'find-return-date':
        print(json.dumps(calculate_return_date(req)))
        return
    if isinstance(req.get('batch'), list):
        common = {k: v for k, v in req.items() if k != 'batch'}
        results = []
        for idx, item in enumerate(req.get('batch') or []):
            try:
                if not isinstance(item, dict):
                    raise ValueError('batch item must be an object')
                item_req = {**common, **item}
                result = calculate_payload(item_req)
                result['batchIndex'] = idx
                results.append(result)
            except Exception as exc:
                results.append({"success": False, "batchIndex": idx, "error": str(exc)})
        print(json.dumps({"success": True, "engine": "Swiss Ephemeris / pyswisseph", "results": results}))
        return

    print(json.dumps(calculate_payload(req)))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}))
