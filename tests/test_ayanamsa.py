import importlib.util
import math
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVICE_PATH = ROOT / "py" / "swiss_ephemeris_service.py"
SPEC = importlib.util.spec_from_file_location("swiss_ephemeris_service", SERVICE_PATH)
service = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(service)


class AyanamsaTests(unittest.TestCase):
    def setUp(self):
        self.jd = service.swe.julday(2026, 11, 5, 12.0, service.swe.GREG_CAL)

    def resolve(self, ayanamsa, custom_value=None, **extra):
        request = {
            "selectedAyanamsaSystem": ayanamsa,
            **extra,
        }
        if custom_value is not None:
            request["customAyanamsa"] = custom_value
        jd = (
            service.julday_from_request(request)
            if any(key in request for key in ("historicalYear", "year", "birthYear"))
            else self.jd
        )
        return service.resolve_ayanamsa(request, jd)

    def test_j2000_is_resolved_as_a_swiss_ayanamsa(self):
        service.swe.set_sid_mode(service.swe.SIDM_J2000)
        expected = service.swe.get_ayanamsa_ut(self.jd)
        self.assertAlmostEqual(self.resolve("J2000"), expected)

    def test_legacy_zodiac_base_does_not_change_ayanamsa(self):
        self.assertAlmostEqual(self.resolve("Tropical"), 0.0)
        self.assertAlmostEqual(
            self.resolve("Tropical", selectedZodiacBase="J2000"),
            0.0,
        )

    def test_displayed_values_use_tropical_as_zero_reference(self):
        values = service.current_ayanamsa_values(
            {"selectedZodiacBase": "J2000", "customAyanamsa": 12.5},
            self.jd,
        )
        self.assertAlmostEqual(values["Tropical"], 0.0)
        self.assertAlmostEqual(values["Custom"], 12.5)
        for name, _ in service.AYANAMSA_MODES.values():
            self.assertTrue(math.isfinite(values[name]))

    def test_custom_ayanamsa_is_not_shifted_by_legacy_base(self):
        self.assertAlmostEqual(
            self.resolve("Custom", 12.5, selectedZodiacBase="J2000"),
            12.5,
        )

    def test_precessed_custom_ayanamsa_uses_j2000_value_for_modern_and_bce_dates(self):
        j2000 = service.swe.julday(2000, 1, 1, 12.0, service.swe.GREG_CAL)
        self.assertAlmostEqual(
            self.resolve(
                "Custom Precessed",
                12.5,
                historicalYear=2000,
                month=1,
                day=1,
                hour=12,
            ),
            12.5,
            places=6,
        )

        modern_jd = service.swe.julday(2026, 11, 5, 12.0, service.swe.GREG_CAL)
        bce_jd = service.swe.julday(-499, 1, 1, 12.0, service.swe.GREG_CAL)
        service.swe.set_sid_mode(service.swe.SIDM_USER, j2000, 12.5)
        self.assertAlmostEqual(
            self.resolve(
                "Custom Precessed",
                12.5,
                historicalYear=2026,
                month=11,
                day=5,
                hour=12,
            ),
            service.swe.get_ayanamsa_ut(modern_jd),
        )
        self.assertAlmostEqual(
            self.resolve("Custom Precessed", 12.5, historicalYear=-500, hour=12),
            service.swe.get_ayanamsa_ut(bce_jd),
        )
        self.assertNotAlmostEqual(
            self.resolve("Custom Precessed", 12.5, historicalYear=-500, hour=12),
            12.5,
        )

    def test_custom_precessed_ayanamsa_is_included_in_display_values(self):
        jd = service.swe.julday(-499, 1, 1, 12.0, service.swe.GREG_CAL)
        values = service.current_ayanamsa_values(
            {"customAyanamsa": 12.5},
            jd,
        )
        service.swe.set_sid_mode(
            service.swe.SIDM_USER,
            service.swe.julday(2000, 1, 1, 12.0, service.swe.GREG_CAL),
            12.5,
        )
        self.assertAlmostEqual(
            values["Custom Precessed"],
            service.swe.get_ayanamsa_ut(jd),
        )

    def test_tropical_precessed_uses_zero_at_j2000_and_precesses_ancient_dates(self):
        j2000 = service.swe.julday(2000, 1, 1, 12.0, service.swe.GREG_CAL)
        modern_jd = service.swe.julday(2026, 11, 5, 12.0, service.swe.GREG_CAL)
        bce_jd = service.swe.julday(-499, 1, 1, 12.0, service.swe.GREG_CAL)

        self.assertAlmostEqual(
            self.resolve(
                "Tropical Precessed",
                historicalYear=2000,
                month=1,
                day=1,
                hour=12,
            ),
            0.0,
            places=6,
        )

        modern_value = self.resolve(
            "Tropical Precessed",
            historicalYear=2026,
            month=11,
            day=5,
            hour=12,
        )
        bce_value = self.resolve(
            "Tropical Precessed",
            historicalYear=-500,
            hour=12,
        )
        service.swe.set_sid_mode(service.swe.SIDM_USER, j2000, 0.0)
        self.assertAlmostEqual(modern_value, service.swe.get_ayanamsa_ut(modern_jd))
        self.assertAlmostEqual(bce_value, service.swe.get_ayanamsa_ut(bce_jd))
        self.assertGreater(modern_value, 0.0)
        self.assertNotAlmostEqual(bce_value, 0.0)


if __name__ == "__main__":
    unittest.main()
