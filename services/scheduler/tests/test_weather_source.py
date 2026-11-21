import pytest

from heatsched.profile import weather_source


def test_the_label_names_the_city_of_the_weather_file() -> None:
    assert weather_source("tests/data/weather_basel_2025.csv") == "Open-Meteo archive, Basel 2025"
    assert weather_source("tests/data/weather_bern_2025.csv") == "Open-Meteo archive, Bern 2025"


def test_a_file_without_a_known_city_is_refused() -> None:
    with pytest.raises(ValueError, match="name the place"):
        weather_source("out/weather.csv")
