# Test data

`weather_basel_2025.csv`: hourly air temperature and shortwave radiation for Basel
(47.56 N, 7.59 E), 2025, local time. From the Open-Meteo historical weather API
(https://open-meteo.com/en/docs/historical-weather-api), CC BY 4.0. Fetched by
`heatsched/profile.py: download_weather` on 21 Nov 2026, unchanged.

`case_profile.csv` (not here yet): the DigitalHeat case CSV. Once saved here, `test_case_profile.py`
checks it against the brief and against the Open-Meteo profile above; until then those tests skip.
