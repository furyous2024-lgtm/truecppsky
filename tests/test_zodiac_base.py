import importlib.util
import math
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SERVICE_PATH = ROOT / "py" / "swiss_ephemeris_service.py"
SPEC = importlib.util.spec_from_file_location("swiss_ephemeris_service", SERVICE_PATH)
service = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(service)


class ZodiacBaseTests(unittest.TestCase):
    def setUp(self):
        self.jd = service.swe.julday(2026, 11, 5, 12.0, service.swe.GREG_CAL)
        self.delta = service.j2000_precession_delta(self.jd)

    def resolve(self, base, ayanamsa, custom_value=None):
        request = {
            "selectedZodiacBase": base,
            "selectedAyanamsaSystem": ayanamsa,
        }
        if custom_value is not None:
            request["customAyanamsa"] = custom_value
        return service.resolve_ayanamsa(request, self.jd)

    def test_j2000_base_converts_zero_ayanamsa_to_j2000(self):
        self.assertAlmostEqual(self.resolve("Tropical", "Tropical"), 0.0)
        self.assertAlmostEqual(self.resolve("J2000", "Tropical"), self.delta)
        self.assertAlmostEqual(self.resolve("J2000", "Custom", 0), self.delta)

    def test_j2000_base_is_applied_to_every_ayanamsa(self):
        ayanamsas = [
            "Custom",
            *[name for name, _ in service.AYANAMSA_MODES.values()],
            *service.CUSTOM_AYANAMSA_PRESETS,
        ]
        for ayanamsa in ayanamsas:
            with self.subTest(ayanamsa=ayanamsa):
                tropical_value = self.resolve("Tropical", ayanamsa, 12.5)
                j2000_value = self.resolve("J2000", ayanamsa, 12.5)
                self.assertAlmostEqual(j2000_value - tropical_value, self.delta)

    def test_custom_raw_applies_j2000_precession_only_once(self):
        expected = 12.5 + self.delta
        self.assertAlmostEqual(self.resolve("Tropical", "Custom Raw", 12.5), expected)
        self.assertAlmostEqual(self.resolve("J2000", "Custom Raw", 12.5), expected)

    def test_unknown_base_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unsupported zodiac base"):
            self.resolve("B1950", "Tropical")

    def test_displayed_values_use_the_selected_base(self):
        values = service.current_ayanamsa_values(
            {"selectedZodiacBase": "J2000", "customAyanamsa": 0},
            self.jd,
        )
        self.assertAlmostEqual(values["Tropical"], self.delta)
        self.assertAlmostEqual(values["Custom"], self.delta)
        for name, _ in service.AYANAMSA_MODES.values():
            self.assertTrue(math.isfinite(values[name]))


if __name__ == "__main__":
    unittest.main()
