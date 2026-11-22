import hashlib
import json

from heatsched.ledger import GENESIS, Ledger, canonical, chains, read, seal, verify
from heatsched.live import plan


def inputs(soc, demand=0.5):
    return dict(
        site="house",
        time="2025-07-15T00:00:00+02:00",
        temp_c=19.5,
        demand_kwh=demand,
        soc_kwh=soc,
        tank_kwh=35.0,
        heat_per_server=0.8,
        forecast_demand=[demand] * 24,
        servers=["s1", "s2"],
        jobs=[dict(id="304", kind="opportunistic", server="s2", agent=True, left_h=None, deadline_h=None)],
        queue=[],
    )


def log(tmp_path, socs=(34.0, 34.3, 35.0)):
    ledger = Ledger(tmp_path / "decisions.jsonl")
    for soc in socs:
        i = inputs(soc)
        ledger.append({"inputs": i, **plan(i)})
    return tmp_path / "decisions.jsonl"


def rewrite(path, entries):
    path.write_text("".join(canonical(e) + "\n" for e in entries))


def test_each_entry_is_hashed_onto_the_one_before(tmp_path):
    entries = read(log(tmp_path))
    assert [e["seq"] for e in entries] == [0, 1, 2]
    assert entries[0]["prev"] == GENESIS
    assert [e["prev"] for e in entries[1:]] == [e["hash"] for e in entries[:-1]]
    body = {k: v for k, v in entries[1].items() if k != "hash"}
    assert entries[1]["hash"] == hashlib.sha256(canonical(body).encode()).hexdigest()


def test_an_untouched_log_replays_without_a_mismatch(tmp_path):
    entries = read(log(tmp_path))
    assert verify(entries, plan) == []
    assert [e["run"] for e in entries] == [["304"], ["304"], []]


def test_reopening_the_log_carries_on_its_chain(tmp_path):
    path = log(tmp_path, socs=(34.0,))
    again = Ledger(path)
    i = inputs(35.0)
    again.append({"inputs": i, **plan(i)})
    entries = read(path)
    assert [e["seq"] for e in entries] == [0, 1] and verify(entries, plan) == []


def test_a_changed_decision_is_found_even_with_its_hash_redone(tmp_path):
    path = log(tmp_path)
    entries = read(path)
    entries[2]["run"] = ["304"]  # claim the job ran with the tank full
    entries[2] = seal({k: v for k, v in entries[2].items() if k not in ("seq", "prev", "hash")}, 2, entries[1]["hash"])
    problems = verify(entries, plan)
    assert problems == ['entry 2: run is ["304"], the replay gives []']


def test_a_changed_input_breaks_the_hash_and_every_link_after(tmp_path):
    entries = read(log(tmp_path))
    entries[0]["inputs"]["soc_kwh"] = 35.0
    problems = verify(entries, plan)
    assert "entry 0: hash does not match its contents" in problems
    assert any(p.startswith("entry 0: decision is") for p in problems)
    # redo the hash: then the next entry's link breaks
    entries[0] = {
        **entries[0],
        "hash": seal({k: v for k, v in entries[0].items() if k not in ("seq", "prev", "hash")}, 0, GENESIS)["hash"],
    }
    assert "entry 1: prev does not match the hash of the entry before" in verify(entries, plan)


def test_a_dropped_entry_is_found(tmp_path):
    entries = read(log(tmp_path))
    problems = verify([entries[0], entries[2]], plan)
    assert "entry 2: seq is 2, expected 1" in problems


def test_the_database_mirror_is_put_back_in_order_by_its_links(tmp_path):
    entries = read(log(tmp_path))
    other = read(log(tmp_path / "other", socs=(10.0, 12.0)))
    rows = [json.loads(canonical(e)) for e in [entries[2], other[1], entries[0], other[0], entries[1]]]
    found = chains(rows)
    assert sorted(len(c) for c in found) == [2, 3]
    assert all(verify(c, plan) == [] for c in found)
