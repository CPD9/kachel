# Kachel: one entry point for setting up, running and checking the repo.
AGENT := services/agent
SCHED := services/scheduler

.PHONY: bootstrap dev db-stop db-reset check check-js check-py check-db check-readme heat-loop year bern-days fleet months measure-ai measure-tagging video-charts paper pitch-graphics live live-demo verify-live

bootstrap:
	pnpm install --frozen-lockfile
	uv sync --project $(AGENT)
	uv sync --project $(SCHED)

# Local Supabase runs in Docker (supabase/config.toml); the apps then read it from their .env.
dev:
	pnpm exec supabase start
	pnpm dev

db-stop:
	pnpm exec supabase stop

# Rebuild the local database from supabase/migrations and supabase/seed.sql.
db-reset:
	pnpm exec supabase db reset

check: check-js check-py check-db check-readme

check-js:
	pnpm format:check
	pnpm turbo run lint typecheck test build

check-py:
	uv run --project $(AGENT) ruff format --check $(AGENT)
	uv run --project $(AGENT) ruff check $(AGENT)
	uv run --project $(AGENT) pytest -q $(AGENT)
	cd $(SCHED) && uv run ruff format --check && uv run ruff check && uv run pytest -q
	uv run --project $(AGENT) ruff format --check scripts/paper
	uv run --project $(AGENT) ruff check scripts/paper

# The yearly balance on the saved Basel 2025 weather: out/kpis.json, hourly.csv and the
# January and July day CSVs (the animation reads those two), plus the plots.
# Spring days for the pitch film's winter-to-summer sweep (with snow, 13 Jan and 15 Jul).
SEASON_DAYS ?= march=2025-03-15 may=2025-05-15

# A snowy January day for the films, with snow on the ground in both cities (data/snow_*.csv).
SNOW_DAY ?= 2025-01-04

year:
	cd $(SCHED) && uv run python run_year.py --weather tests/data/weather_basel_2025.csv --day snow=$(SNOW_DAY) \
		$(foreach d,$(SEASON_DAYS),--day $(d))

# The same reference house on Bern 2025 weather: day files and kpis in $(SCHED)/out/bern/.
# run_year.py writes to ./out, so it runs in a scratch folder and the results are copied.
BERN_RUN := $(HOME)/.cache/kachel/tmp/bern-year

bern-days:
	rm -rf $(BERN_RUN) && mkdir -p $(BERN_RUN) $(SCHED)/out/bern
	cd $(BERN_RUN) && uv run --project $(CURDIR)/$(SCHED) python $(CURDIR)/$(SCHED)/run_year.py \
		--config $(CURDIR)/$(SCHED)/config.json --weather $(CURDIR)/$(SCHED)/tests/data/weather_bern_2025.csv --day snow=$(SNOW_DAY)
	cp $(BERN_RUN)/out/day_january.csv $(BERN_RUN)/out/day_july.csv $(BERN_RUN)/out/day_snow.csv $(BERN_RUN)/out/kpis.json $(SCHED)/out/bern/

# The live loop (#191): every tick the same decide() as `make year` reads the house, writes the
# agent's signal file and places queued console jobs, and appends the decision to the hash-chained
# log (out/decisions.jsonl and the decisions table). Replays 13 January and 15 July on the saved
# Basel weather at LIVE_PACE seconds an hour; LIVE_ARGS="--source db --tick 3600" for real time.
# Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (services/agent/.env).
LIVE_AGENT ?= 00000000-0000-4000-8000-000000000304=/tmp/heat
LIVE_PACE ?= 2.5
LIVE_ARGS ?=
live:
	cd $(SCHED) && set -a && . ../agent/.env && set +a && uv run python live.py \
		--agent $(LIVE_AGENT) --seconds-per-hour $(LIVE_PACE) $(LIVE_ARGS)

# The stage demo in one command (scripts/live-demo.sh): a real embedding job on Server 4, its agent
# and the live loop on 13 January and 15 July, about a minute a day. Ctrl-C stops all three.
live-demo:
	LIVE_PACE=$(LIVE_PACE) scripts/live-demo.sh

# Replay the decision log through decide() and report any mismatch (VERIFY_ARGS=--db for the table).
VERIFY_ARGS ?=
verify-live:
	cd $(SCHED) && $(if $(VERIFY_ARGS),set -a && . ../agent/.env && set +a && ,)uv run python verify_live.py $(VERIFY_ARGS)

# The row level security tests (supabase/tests) need the local stack from `make dev`. Without
# it they are skipped here with a note; the Database CI job always runs them.
check-db:
	@if pnpm exec supabase status >/dev/null 2>&1; then pnpm exec supabase test db; \
	else echo "check-db: local Supabase is not running (make dev); skipped, CI runs it."; fi

# Synthetic fleets on the January and July days, on the saved 2025 weather: 50 houses in Basel, 50 in
# Bern, and both as one fleet. Where every job ran, each house's heat by the hour and the KPIs
# (out/fleet_*.csv and fleet_*kpis.json).
fleet:
	cd $(SCHED) && uv run python run_fleet.py

# The Basel and Bern fleet month by month on the saved 2025 weather, and what-ifs from 6 degrees
# colder to 6 degrees warmer: every house through the scheduler for the year (out/fleet_months.json,
# read by the operator view). About three minutes on seven of eight cores; MONTHS_JOBS=2 for fewer.
MONTHS_JOBS ?=
months:
	cd $(SCHED) && uv run python run_months.py $(if $(MONTHS_JOBS),--jobs $(MONTHS_JOBS))

# Measure the two real AI jobs on this machine through the local Ollama (nomic-embed-text and
# qwen3:4b, already pulled; nothing is downloaded), GPU power metered with nvidia-smi every 100 ms
# above the idle baseline. Waits up to an hour for an idle GPU with no Blender on it. Writes
# docs/measurements/ai-*.csv and ai-summary.json; see docs/measurements.md. About five minutes.
measure-ai:
	cd $(SCHED) && uv run python -u measure_ai.py
	pnpm exec prettier --write docs/measurements/ai-summary.json

# Image tagging on the GPU (measure_tagging.py). Needs torch and torchvision, which the scheduler's own
# environment leaves out: TORCH_PY=/path/to/a/venv/bin/python make measure-tagging
TORCH_PY ?= python3
measure-tagging:
	cd $(SCHED) && $(TORCH_PY) -u measure_tagging.py
	pnpm exec prettier --write docs/measurements/tagging-summary.json

check-readme:
	python3 scripts/pitch/voiceover.py --check
	node --test scripts/*.test.mjs
	pnpm readme:check
	uv run --project $(AGENT) pytest -q -p no:cacheprovider scripts/paper

# The model paper (docs/paper): fill the template from the model's output files, then print the
# PDF and one PNG per page with headless Chromium (pages to $$PAPER_PAGES, default
# ~/.cache/kachel/pitch/paper-pages). Run make year, make bern-days, make fleet and economics.py first
# when the model has changed; check-readme fails while the paper is stale.
paper:
	python3 scripts/paper/build.py
	uv run --no-project --offline --with playwright python scripts/paper/render.py

# Rebuild the heat-loop animations with Blender 5.2 and ffmpeg (see scripts/heat-loop/heat_loop.py):
# the whole house for the README, and a wide crop on the basement for the app header.
BLENDER ?= blender
HEAT_LOOP_WORK ?= $(HOME)/.cache/kachel/heat-loop
HEAT_LOOP_STILL := 0060

# $(call heat-loop-render,view,render size,output size,output name)
define heat-loop-render
	rm -rf $(HEAT_LOOP_WORK)/$(1)
	mkdir -p $(HEAT_LOOP_WORK)/$(1) $(HOME)/.cache/kachel/tmp
	TMPDIR=$(HOME)/.cache/kachel/tmp $(BLENDER) --background --factory-startup \
		--python scripts/heat-loop/heat_loop.py -- --out $(HEAT_LOOP_WORK)/$(1) --view $(1) \
		--width $(word 1,$(subst x, ,$(2))) --height $(word 2,$(subst x, ,$(2)))
	ffmpeg -y -loglevel error -f lavfi -i color=c=0xfbf8f3:s=$(2):r=24 \
		-framerate 24 -i $(HEAT_LOOP_WORK)/$(1)/%04d.png \
		-filter_complex "[0][1]overlay=shortest=1:format=auto,scale=$(3):flags=lanczos" \
		-c:v libwebp_anim -quality 80 -compression_level 6 -loop 0 \
		packages/ui/src/$(4).webp
	ffmpeg -y -loglevel error -f lavfi -i color=c=0xfbf8f3:s=$(2) \
		-i $(HEAT_LOOP_WORK)/$(1)/$(HEAT_LOOP_STILL).png \
		-filter_complex "[0][1]overlay=format=auto,scale=$(3):flags=lanczos" \
		-frames:v 1 packages/ui/src/$(4)-still.png
endef

heat-loop:
	$(call heat-loop-render,house,1080x900,720:600,heat-loop)
	$(call heat-loop-render,wide,1440x480,960:320,heat-loop-wide)

# Pitch video segments (see scripts/video/). Renders with Blender 5.2 on the GPU,
# one Cycles job at a time, and writes MP4s and contact sheets to $(VIDEO_OUT).
VIDEO_OUT ?= $(HOME)/.cache/kachel/video
SCHED_OUT ?= services/scheduler/out
VIDEO_SAMPLES ?= 64
SETUP_SAMPLES ?= 32
VIDEO_BLEND := scripts/video/assets/plantroom.blend
VIDEO_BLENDER = TMPDIR=$(HOME)/.cache/kachel/tmp $(BLENDER) --background $(VIDEO_BLEND)

.PHONY: video-setup video-scheduler video-daynight video-daynight-bern video-film video-film-2min video-glb

video-setup:
	mkdir -p $(VIDEO_OUT)/work/setup $(HOME)/.cache/kachel/tmp
	scripts/video/gpu_wait.sh
	$(VIDEO_BLENDER) --python scripts/video/setup.py -- \
		--out $(VIDEO_OUT)/work/setup --samples $(SETUP_SAMPLES)
	uv run --no-project --with pillow python scripts/video/compose_setup.py \
		--frames $(VIDEO_OUT)/work/setup \
		--mp4 $(VIDEO_OUT)/02-setup.mp4 --sheet $(VIDEO_OUT)/02-setup-sheet.png

video-scheduler:
	test -f $(SCHED_OUT)/day_january.csv -a -f $(SCHED_OUT)/day_july.csv || $(MAKE) year
	mkdir -p $(VIDEO_OUT)/work/scheduler $(HOME)/.cache/kachel/tmp
	scripts/video/gpu_wait.sh
	$(VIDEO_BLENDER) --python scripts/video/scheduler.py -- \
		--days $(SCHED_OUT)/day_january.csv $(SCHED_OUT)/day_july.csv \
		--out $(VIDEO_OUT)/work/scheduler --samples $(VIDEO_SAMPLES)
	uv run --no-project --with pillow python scripts/video/compose.py \
		--frames $(VIDEO_OUT)/work/scheduler \
		--days $(SCHED_OUT)/day_january.csv $(SCHED_OUT)/day_july.csv \
		--mp4 $(VIDEO_OUT)/03-scheduler.mp4 --sheet $(VIDEO_OUT)/03-scheduler-sheet.png

# Day-night split film: Basel outside (read from heat-atlas, never written there) and the
# plant room, one still per hour of a day file. DAYNIGHT_DAY picks the day.
DAYNIGHT_DAY ?= january
DAYNIGHT_SAMPLES ?= 48
DAYNIGHT_STEPS ?= 4
# Snow on roofs and ground (and falling flakes when it snows) for the snowy day only.
SNOW_FLAG = $(if $(filter snow,$(DAYNIGHT_DAY)),--snow)
# FAST=1: the 2x cut for the pitch film, 18 s a day, the outside camera orbiting slowly.
FAST ?=
FAST_OUT = $(if $(FAST),--orbit-frames 432)
FAST_MIX = $(if $(FAST),--hour-frames 18)
FAST_TAG = $(if $(FAST),-2x)
DAYNIGHT_WORK = $(VIDEO_OUT)/work/daynight-$(DAYNIGHT_DAY)$(FAST_TAG)

video-daynight:
	test -f $(SCHED_OUT)/day_$(DAYNIGHT_DAY).csv || $(MAKE) year
	mkdir -p $(DAYNIGHT_WORK) $(HOME)/.cache/kachel/tmp
	scripts/video/gpu_wait.sh
	TMPDIR=$(HOME)/.cache/kachel/tmp $(BLENDER) --background $(HOME)/Projects/heat-atlas/renders/skyline.blend \
		--python scripts/video/daynight.py -- --part outside --day $(SCHED_OUT)/day_$(DAYNIGHT_DAY).csv \
		--out $(DAYNIGHT_WORK) --samples $(DAYNIGHT_SAMPLES) --steps $(DAYNIGHT_STEPS) $(SNOW_FLAG) $(FAST_OUT)
	scripts/video/gpu_wait.sh
	$(VIDEO_BLENDER) --python scripts/video/daynight.py -- --part inside \
		--day $(SCHED_OUT)/day_$(DAYNIGHT_DAY).csv --out $(DAYNIGHT_WORK) --samples $(DAYNIGHT_SAMPLES)
	uv run --no-project --with pillow python scripts/video/compose_daynight.py $(SNOW_FLAG) $(FAST_MIX) \
		--frames $(DAYNIGHT_WORK) --day $(SCHED_OUT)/day_$(DAYNIGHT_DAY).csv \
		--mp4 $(VIDEO_OUT)/daynight-$(DAYNIGHT_DAY)$(FAST_TAG).mp4 --sheet $(VIDEO_OUT)/daynight-$(DAYNIGHT_DAY)$(FAST_TAG)-sheet.png

# The same film with Bern outside: the scene is built once from swissBUILDINGS3D tiles into
# the cache (scripts/video/bern.py), never into heat-atlas or the repo.
BERN_BLEND ?= $(HOME)/.cache/kachel/bern/bern.blend
# Day files and kpis for the Bern film (`make bern-days`); servers come from its kpis.json.
DAYS_DIR ?= $(SCHED)/out/bern
BERN_WORK = $(VIDEO_OUT)/work/daynight-bern-$(DAYNIGHT_DAY)$(FAST_TAG)

$(BERN_BLEND):
	TMPDIR=$(HOME)/.cache/kachel/tmp $(BLENDER) --background --factory-startup \
		--python scripts/video/bern.py -- --out $(BERN_BLEND)

video-daynight-bern: $(BERN_BLEND)
	test -f $(DAYS_DIR)/day_$(DAYNIGHT_DAY).csv || $(MAKE) bern-days
	mkdir -p $(BERN_WORK) $(HOME)/.cache/kachel/tmp
	scripts/video/gpu_wait.sh
	TMPDIR=$(HOME)/.cache/kachel/tmp $(BLENDER) --background $(BERN_BLEND) \
		--python scripts/video/daynight.py -- --part outside --city bern \
		--day $(DAYS_DIR)/day_$(DAYNIGHT_DAY).csv --out $(BERN_WORK) \
		--samples $(DAYNIGHT_SAMPLES) --steps $(DAYNIGHT_STEPS) $(SNOW_FLAG) $(FAST_OUT)
	scripts/video/gpu_wait.sh
	$(VIDEO_BLENDER) --python scripts/video/daynight.py -- --part inside \
		--day $(DAYS_DIR)/day_$(DAYNIGHT_DAY).csv --out $(BERN_WORK) --samples $(DAYNIGHT_SAMPLES)
	uv run --no-project --with pillow python scripts/video/compose_daynight.py $(SNOW_FLAG) $(FAST_MIX) --city bern \
		--frames $(BERN_WORK) --day $(DAYS_DIR)/day_$(DAYNIGHT_DAY).csv \
		--mp4 $(VIDEO_OUT)/daynight-bern-$(DAYNIGHT_DAY)$(FAST_TAG).mp4 \
		--sheet $(VIDEO_OUT)/daynight-bern-$(DAYNIGHT_DAY)$(FAST_TAG)-sheet.png

# The whole film from the rendered parts: January day-night, setup, scheduler, the four
# economics charts, the live demo (letterboxed) and July day-night to close.
video-film:
	python3 scripts/video/stitch.py --out $(VIDEO_OUT)/kachel-film.mp4 \
		--sheet $(VIDEO_OUT)/kachel-film-sheet.png \
		$(VIDEO_OUT)/daynight-january.mp4 $(VIDEO_OUT)/02-setup.mp4 $(VIDEO_OUT)/03-scheduler.mp4 \
		$(CHARTS_OUT)/month.mp4 $(CHARTS_OUT)/breakeven.mp4 $(CHARTS_OUT)/sensitivity.mp4 \
		$(CHARTS_OUT)/payback.mp4 $(VIDEO_OUT)/release/live-demo.mp4 $(VIDEO_OUT)/daynight-july.mp4

# The two-minute pitch cut in talk-track order, plus a 720p copy (see scripts/video/cut_2min.sh).
video-film-2min:
	scripts/video/cut_2min.sh $(VIDEO_OUT) $(CHARTS_OUT) $(VIDEO_OUT)/kachel-film-2min.mp4

# The plant room meshes as they appear in the video, for three.js.
video-glb:
	$(VIDEO_BLENDER) --python scripts/video/export_glb.py -- --out docs/models/plantroom.glb

# Render the economics charts for the pitch video with Blender 5.2 and ffmpeg (see
# scripts/video/charts.py): one H.264 MP4 per chart and a PNG of its last frame.
CHARTS_OUT ?= $(HOME)/.cache/kachel/video/charts

video-charts:
	mkdir -p $(CHARTS_OUT) $(HOME)/.cache/kachel/tmp
	for chart in month breakeven sensitivity payback; do \
		TMPDIR=$(HOME)/.cache/kachel/tmp $(BLENDER) --background --factory-startup \
			--python scripts/video/charts.py -- --chart $$chart \
			--out $(CHARTS_OUT)/frames/$$chart --mp4 $(CHARTS_OUT)/$$chart.mp4 \
			--still $(CHARTS_OUT)/$$chart.png || exit 1; \
	done

# The 2D shots of the pitch film (scripts/pitch/): maps, titles, numbers, product and end card,
# one MP4 each in ~/.cache/kachel/pitch/shots and a contact sheet in ~/.cache/kachel/pitch/sheets.
# Figures are read at render time from the scheduler's output (make year, bern-days, fleet) and
# docs/economics/data; maps from docs/media/geo and heat-atlas (read-only). CPU only.
PITCH_SHOTS := shot16_u_curve shot05_basel_to_switzerland shot06_title_bern shot07_bern_map shot09_numbers \
	shot10_farm_solar_numbers shot13_product shot14_business_logic shot15_cta

pitch-graphics:
	test -f $(SCHED_OUT)/kpis.json || $(MAKE) year
	test -f $(SCHED_OUT)/bern/kpis.json || $(MAKE) bern-days
	test -f $(SCHED_OUT)/fleet_basel_bern_kpis.json || $(MAKE) fleet
	for shot in $(PITCH_SHOTS); do scripts/pitch/run.sh $$shot.py || exit 1; done
