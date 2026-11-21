"""Local AI chat with tools (Ollama). NOT tested against a live Ollama in the sandbox: try it first.

  ollama pull qwen2.5:3b && python chat.py
Every answer is itself an interactive job: the model runs on the box that heats the house.
"""
import json, subprocess, sys, urllib.request
MODEL, URL = "qwen2.5:3b", "http://localhost:11434/api/chat"

def house_status():
    "Key figures of the last yearly run for the reference house."
    return json.load(open("out/kpis.json"))
def compare_server_counts():
    "Coverage, utilisation and dumped heat for 1 to 14 servers."
    return open("out/sweep.csv").read()
def live_state():
    "What the scheduler and the real job are doing right now."
    h = json.load(open("out/live_state.json"))["hours"]; return h[-1] if h else {}
def rerun_year(servers: int = 0, electricity_chf_per_kwh: float = 0.0):
    "Re-run the yearly balance with another server count or electricity price."
    cfg = json.load(open("config.json"))
    if electricity_chf_per_kwh: cfg["prices"]["electricity_chf_per_kwh"] = electricity_chf_per_kwh
    json.dump(cfg, open("out/_whatif.json", "w"))
    cmd = [sys.executable, "run_year.py", "--config", "out/_whatif.json"] + (["--servers", str(servers)] if servers else [])
    subprocess.run(cmd + sys.argv[1:], capture_output=True); return house_status()

TOOLS = {f.__name__: f for f in (house_status, compare_server_counts, live_state, rerun_year)}
SPEC = [{"type": "function", "function": {"name": n, "description": f.__doc__, "parameters": {"type": "object",
         "properties": ({"servers": {"type": "integer"}, "electricity_chf_per_kwh": {"type": "number"}} if n == "rerun_year" else {})}}}
        for n, f in TOOLS.items()]
msgs = [{"role": "system", "content": "You run a home's compute heater. Answer in two short sentences, numbers first, "
         "from tool results only. Say plainly when the model does not pay off."}]

def ask(text):
    msgs.append({"role": "user", "content": text})
    while True:
        req = urllib.request.Request(URL, json.dumps({"model": MODEL, "messages": msgs, "tools": SPEC, "stream": False}).encode(),
                                     {"Content-Type": "application/json"})
        m = json.load(urllib.request.urlopen(req))["message"]; msgs.append(m)
        if not m.get("tool_calls"): return m["content"]
        for c in m["tool_calls"]:
            fn = c["function"]; out = TOOLS[fn["name"]](**(fn.get("arguments") or {}))
            msgs.append({"role": "tool", "content": json.dumps(out) if not isinstance(out, str) else out})

if __name__ == "__main__":
    while True:
        try: print(ask(input("you> ")))
        except (EOFError, KeyboardInterrupt): break
