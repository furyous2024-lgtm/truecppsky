import importlib.util
import math
import pathlib
import unittest
from unittest.mock import patch


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

    def test_custom_tropical_precessed_uses_current_raw_value_then_precesses(self):
        modern_jd = service.swe.julday(2026, 11, 5, 12.0, service.swe.GREG_CAL)
        bce_jd = service.swe.julday(-499, 1, 1, 12.0, service.swe.GREG_CAL)
        reference_jd = service.swe.julday(2026, 11, 5, 12.0, service.swe.GREG_CAL)

        with patch.object(service, "precession_reference_jd", return_value=reference_jd):
            modern_value = self.resolve(
                "Custom Tropical Precessed",
                27.3490208119,
                historicalYear=2026,
                month=11,
                day=5,
                hour=12,
            )
            bce_value = self.resolve(
                "Custom Tropical Precessed",
                27.3490208119,
                historicalYear=-500,
                hour=12,
            )

        service.swe.set_sid_mode(
            service.swe.SIDM_USER,
            reference_jd,
            27.3490208119,
        )
        self.assertAlmostEqual(
            modern_value,
            service.swe.get_ayanamsa_ut(modern_jd),
            places=6,
        )
        self.assertAlmostEqual(
            modern_value,
            27.3490208119,
            places=6,
        )
        self.assertAlmostEqual(bce_value, service.swe.get_ayanamsa_ut(bce_jd))
        self.assertNotAlmostEqual(bce_value, 27.3490208119)

    def test_custom_tropical_precessed_value_is_displayed_as_calculated(self):
        reference_jd = service.swe.julday(2026, 11, 5, 12.0, service.swe.GREG_CAL)
        with patch.object(service, "precession_reference_jd", return_value=reference_jd):
            values = service.current_ayanamsa_values(
                {"customAyanamsa": 27.3490208119},
                reference_jd,
            )
        self.assertAlmostEqual(
            values["Custom Tropical Precessed"],
            27.3490208119,
            places=6,
        )

    def test_custom_tropical_precessed_zero_is_exact_tropical_on_reference_day(self):
        reference_jd = service.swe.julday(2026, 11, 5, 12.0, service.swe.GREG_CAL)
        request = {
            "selectedAyanamsaSystem": "Custom Tropical Precessed",
            "customAyanamsa": 0.0,
            "historicalYear": 2026,
            "month": 11,
            "day": 5,
            "hour": 6,
        }
        with patch.object(service, "precession_reference_jd", return_value=reference_jd):
            ayanamsa = service.resolve_ayanamsa(request, service.julday_from_request(request))
            values = service.current_ayanamsa_values(request, service.julday_from_request(request))

        self.assertEqual(ayanamsa, 0.0)
        self.assertEqual(values["Custom Tropical Precessed"], 0.0)

    def test_custom_tropical_precessed_does_not_use_j2000_as_reference(self):
        reference_jd = service.swe.julday(2026, 11, 5, 12.0, service.swe.GREG_CAL)
        ancient_jd = service.swe.julday(-499, 1, 1, 12.0, service.swe.GREG_CAL)
        service.swe.set_sid_mode(
            service.swe.SIDM_USER,
            reference_jd,
            27.3490208119,
        )
        expected = service.swe.get_ayanamsa_ut(ancient_jd)
        with patch.object(service, "precession_reference_jd", return_value=reference_jd):
            actual = self.resolve(
                "Custom Tropical Precessed",
                27.3490208119,
                historicalYear=-500,
                hour=12,
            )
        self.assertAlmostEqual(actual, expected)

    def test_custom_tropical_precessed_requires_an_input_value(self):
        with self.assertRaisesRegex(ValueError, "customAyanamsa is required"):
            self.resolve("Custom Tropical Precessed")


if __name__ == "__main__":
    unittest.main()
