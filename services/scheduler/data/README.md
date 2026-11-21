# Snow data for the films

`snow_basel_2025.csv` and `snow_bern_2025.csv`: hourly snowfall (cm) and snow depth (m) for
2025, local time, written by `fetch_snow.py` from the Open-Meteo historical weather API
(https://open-meteo.com/en/docs/historical-weather-api), CC BY 4.0, fetched 21 Nov 2026.
The scheduler does not use them; only the day-night renders read them, to show snow lying
on the ground and snow falling in the hours when it did.
