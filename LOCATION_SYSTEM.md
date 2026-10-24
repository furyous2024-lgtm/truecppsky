# Location and time-zone controls

The chart forms share a location-control module in `js/localSwiss.js`.

- City selection first uses `data/cities.json` (352 curated city records); names are normalized so accents and common country-name aliases do not prevent a match. Records include coordinates and IANA zones for many additional Brazilian, Israeli, Palestinian, and international cities.
- The autocomplete in `js/locationSuggestions.js` searches the bundled `locations.json` list (162,722 locality labels) using city and region/country prefix indexes. Users can search by city, state/province, or country; common Portuguese and English country names (for example `Brazil`/`Brasil`, `Germany`/`Alemanha`, `United States`/`Estados Unidos`, and `Palestine`/`Palestina`) are treated as equivalents. It displays up to 12 suggestions instead of 5.
- Common Portuguese city names such as `Munique`, `Londres`, `Roma`, `Tóquio`, `Pequim`, `Nova York`, and `Cidade do México` are search aliases for the canonical place label. The selected label remains unambiguous for coordinate and time-zone resolution.
- `Belém` is also recognized as a Portuguese search alias for `Bethlehem` in the West Bank; the actual, unambiguous `Bethlehem, West Bank, Palestinian Territory` label remains the selected value.
- When the selected city is not covered by the local coordinate file, the app can use `/api/location-search` (Open-Meteo geocoding) and keeps the resolved coordinates/time zone in local browser storage. This online fallback requires a network connection.
- The IANA time-zone field has suggestions generated from the browser's supported time-zone list. UTC offsets are calculated for the selected chart date, so historical offsets and daylight-saving transitions are handled by the platform time-zone database when available.
- `Use my current location` asks the browser for location permission, fills latitude/longitude, then resolves a time zone. If the network lookup is unavailable, the device's time zone is displayed only as a fallback and should be checked.
- Coordinates can still be entered manually. Use the `Manual UTC offset` mode when a custom location's time zone is not known; offset values are in hours, with quarter-hour increments supported.

The server-side proxy routes are `/api/location-search` and `/api/timezone`. Browser-side fallbacks preserve compatibility with older deployments that do not yet include those routes.
