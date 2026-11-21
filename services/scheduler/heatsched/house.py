"""House quality (issue #159): a building's yearly heat from its floor area and construction period.

The numbers live in config.json: house_quality, with their sources; packages/economics
(heatDemand in src/house.ts) reads the same block, so the map's card and this module agree.
"""

PERIODS = (
    "before_1919",
    "1919_1945",
    "1946_1960",
    "1961_1970",
    "1971_1980",
    "1981_1990",
    "1991_2000",
    "2001_2005",
    "2006_2010",
    "2011_2015",
    "after_2015",
)

# GWR gbaup codes (BFS feature catalogue 4.2) to our periods; the register splits the 1980s and 1990s in two.
GBAUP = {
    8011: "before_1919",
    8012: "1919_1945",
    8013: "1946_1960",
    8014: "1961_1970",
    8015: "1971_1980",
    8016: "1981_1990",
    8017: "1981_1990",
    8018: "1991_2000",
    8019: "1991_2000",
    8020: "2001_2005",
    8021: "2006_2010",
    8022: "2011_2015",
    8023: "after_2015",
}

# Last year of each period but the newest, in order.
_ENDS = (1918, 1945, 1960, 1970, 1980, 1990, 2000, 2005, 2010, 2015)


def period_of(gbaup=None, gbauj=None):
    """The period from the GWR year built (gbauj) or, without one, its period code (gbaup). None if neither."""
    if gbauj is not None:
        return next((p for p, end in zip(PERIODS[:-1], _ENDS, strict=True) if gbauj <= end), PERIODS[-1])
    return GBAUP.get(gbaup)


# GWR building class (gklas) to the use whose figures it takes (Egon AG for SFOE, Tabelle 1 and 2).
USE_OF_GKLAS = {
    1110: "single",
    1121: "single",
    1122: "multi",
    1130: "multi",
    1211: "multi",
    1212: "multi",
    1220: "office",
    1230: "shop",
    1231: "restaurant",
    1251: "industry",
    1261: "assembly",
    1272: "assembly",
    1262: "school",
    1263: "school",
    1264: "hospital",
    1265: "sport",
}


def kind_of(gklas):
    """The use a GWR class takes its figures from; None for the classes the table gives no heat (garages, barns)."""
    return USE_OF_GKLAS.get(gklas)


def heat_demand(cfg, area_m2, period, renovated=False, kind="single"):
    """Space heating and hot water a year, kWh, for a building of area_m2 heated floor."""
    q = cfg["house_quality"]
    factor = q["period_factor"][period]
    if renovated:
        factor = max(factor * q["renovated_factor"], q["period_factor"]["after_2015"])
    space = area_m2 * q["space_heating_kwh_per_m2"][kind] * factor
    water = area_m2 * q["hot_water_kwh_per_m2"][kind]
    return {"space_heating_kwh": space, "hot_water_kwh": water, "total_kwh": space + water}
