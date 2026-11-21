from heatsched.scheduler import Signal, decide


def signal(**over: object) -> Signal:
    base: dict[str, object] = dict(
        n_servers=6,
        heat_per_server=0.8,
        demand_kwh=2.0,
        soc_kwh=0.0,
        tank_kwh=35.0,
        interactive_due=0.0,
        batch_queue=[],
        forecast_demand=[],
        forecast_interactive=[],
    )
    base.update(over)
    return Signal(**base)  # type: ignore[arg-type]


def test_interactive_runs_even_when_the_tank_is_full() -> None:
    d = decide(signal(soc_kwh=35.0, demand_kwh=0.0, interactive_due=2))
    assert d.interactive == 2
    assert d.opportunistic == 0


def test_backlog_fills_only_the_useful_heat_room() -> None:
    # 2 kWh demand + 2.4 kWh free in the tank = 4.4 kWh of room, 0.8 kWh per server-hour.
    d = decide(signal(soc_kwh=32.6))
    assert d.opportunistic == 5


def test_servers_are_off_when_the_tank_is_full_and_nothing_is_wanted() -> None:
    d = decide(signal(soc_kwh=35.0, demand_kwh=0.0))
    assert d.running == 0
    assert "paused" in d.reason


def test_deadline_work_waits_for_heat_and_moves_at_its_last_hour() -> None:
    full = dict(soc_kwh=35.0, demand_kwh=0.0)
    early = decide(signal(**full, batch_queue=[(10, 4.0)]))
    assert (early.batch, early.batch_moved) == (0, 0.0)
    last = decide(signal(**full, batch_queue=[(1, 4.0)]))
    assert last.batch == 0
    assert last.batch_moved == 4.0


def test_deadline_work_runs_before_the_backlog() -> None:
    d = decide(signal(soc_kwh=33.4, batch_queue=[(10, 2.0)]))
    # 3.6 kWh of room: 4 server-hours, 2 go to the deadline job first.
    assert (d.batch, d.opportunistic) == (2, 2)


def test_tank_room_is_kept_for_interactive_heat_that_is_coming() -> None:
    no_forecast = decide(signal(soc_kwh=32.6))
    with_forecast = decide(signal(soc_kwh=32.6, forecast_demand=[0.0], forecast_interactive=[2]))
    assert with_forecast.reserve_kwh == 1.6
    assert with_forecast.opportunistic == no_forecast.opportunistic - 2
