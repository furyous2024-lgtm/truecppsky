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
        return service.resolve_ayanamsa(request, self.jd)

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


if __name__ == "__main__":
    unittest.main()
