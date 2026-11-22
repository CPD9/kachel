"""The live loop's reads and writes on Supabase (PostgREST), with the service role key.

The key is passed in by live.py, which reads it from the environment only. Tests use a fake with
the same methods (tests/test_live_loop.py).
"""
import json
import urllib.error
import urllib.parse
import urllib.request

LIVE = ("RUNNING", "PAUSED")
JOB_COLUMNS = "id,kind,state,label,site_id,server_id,server_hours,deadline_at,active_cpu_s"


class SupabaseError(RuntimeError):
    pass


class Supabase:
    def __init__(self, url, key, timeout=10):
        self.base = f"{url.rstrip('/')}/rest/v1"
        self.headers = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):            # legacy JWT keys go in Authorization too
            self.headers["Authorization"] = f"Bearer {key}"
        self.timeout = timeout

    def _call(self, method, table, params=None, body=None, prefer="return=minimal"):
        query = urllib.parse.urlencode(params or {}, safe=",.()*:")
        req = urllib.request.Request(f"{self.base}/{table}?{query}", method=method,
                                     data=None if body is None else json.dumps(body).encode(),
                                     headers={**self.headers, "Prefer": prefer})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                raw = res.read()
        except urllib.error.HTTPError as e:
            raise SupabaseError(f"{method} {table}: {e.code} {e.read().decode()[:300]}") from None
        except urllib.error.URLError as e:
            raise SupabaseError(f"{method} {table}: {e.reason}") from None
        return json.loads(raw) if raw else None

    def _get(self, table, **params):
        return self._call("GET", table, params)

    # reads
    def house(self, site_id):
        """The site with its servers in slot order, or None."""
        sites = self._get("sites", select="id,name,tank_kwh", id=f"eq.{site_id}")
        if not sites:
            return None
        servers = self._get("servers", select="id,slot,name,state,power_kw,heat_recovery",
                            site_id=f"eq.{site_id}", order="slot")
        return {**sites[0], "servers": servers}

    def house_jobs(self, server_ids):
        """Running and paused jobs on these servers."""
        if not server_ids:
            return []
        return self._get("jobs", select=JOB_COLUMNS, server_id=f"in.({','.join(server_ids)})",
                         state="in.(RUNNING,PAUSED)", order="id")

    def queued(self, site_id):
        """Queued jobs not yet on a server, sent to no house or to this one."""
        return self._get("jobs", select=JOB_COLUMNS, state="eq.QUEUED", server_id="is.null",
                         moved_offsite="is.false", **{"or": f"(site_id.is.null,site_id.eq.{site_id})"},
                         order="created_at,id")

    def heat_rows(self, site_id, start_iso, end_iso):
        """heat_state rows of the site from start (inclusive) to end (exclusive), oldest first."""
        return self._call("GET", "heat_state", [
            ("select", "time,temp_c,demand_kwh,soc_kwh"), ("site_id", f"eq.{site_id}"),
            ("time", f"gte.{start_iso}"), ("time", f"lt.{end_iso}"), ("order", "time")])

    def decisions(self):
        """Every logged decision's entry text, for verify_live.py --db."""
        return [r["entry"] for r in self._get("decisions", select="entry", order="written_at,seq")]

    # writes
    def update_job(self, job_id, fields):
        self._call("PATCH", "jobs", {"id": f"eq.{job_id}"}, fields)

    def update_server(self, server_id, fields):
        self._call("PATCH", "servers", {"id": f"eq.{server_id}"}, fields)

    def add_decision(self, row):
        self._call("POST", "decisions", body=row)
