# Kachel: one entry point for setting up, running and checking the repo.
AGENT := services/agent
SCHED := services/scheduler

.PHONY: bootstrap dev db-stop db-reset check check-js check-py check-db check-readme heat-loop year bern-days fleet video-charts paper

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
# A snowy January day for the films, with snow on the ground in both cities (data/snow_*.csv).
SNOW_DAY ?= 2025-01-04

year:
	cd $(SCHED) && uv run python run_year.py --weather tests/data/weather_basel_2025.csv --day snow=$(SNOW_DAY)

# The same reference house on Bern 2025 weather: day files and kpis in $(SCHED)/out/bern/.
# run_year.py writes to ./out, so it runs in a scratch folder and the results are copied.
BERN_RUN := $(HOME)/.cache/kachel/tmp/bern-year

bern-days:
	rm -rf $(BERN_RUN) && mkdir -p $(BERN_RUN) $(SCHED)/out/bern
	cd $(BERN_RUN) && uv run --project $(CURDIR)/$(SCHED) python $(CURDIR)/$(SCHED)/run_year.py \
		--config $(CURDIR)/$(SCHED)/config.json --weather $(CURDIR)/$(SCHED)/tests/data/weather_bern_2025.csv --day snow=$(SNOW_DAY)
	cp $(BERN_RUN)/out/day_january.csv $(BERN_RUN)/out/day_july.csv $(BERN_RUN)/out/day_snow.csv $(BERN_RUN)/out/kpis.json $(SCHED)/out/bern/

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

check-readme:
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
DAYNIGHT_WORK = $(VIDEO_OUT)/work/daynight-$(DAYNIGHT_DAY)

video-daynight:
	test -f $(SCHED_OUT)/day_$(DAYNIGHT_DAY).csv || $(MAKE) year
	mkdir -p $(DAYNIGHT_WORK) $(HOME)/.cache/kachel/tmp
	scripts/video/gpu_wait.sh
	TMPDIR=$(HOME)/.cache/kachel/tmp $(BLENDER) --background $(HOME)/Projects/heat-atlas/renders/skyline.blend \
		--python scripts/video/daynight.py -- --part outside --day $(SCHED_OUT)/day_$(DAYNIGHT_DAY).csv \
		--out $(DAYNIGHT_WORK) --samples $(DAYNIGHT_SAMPLES) --steps $(DAYNIGHT_STEPS) $(SNOW_FLAG)
	scripts/video/gpu_wait.sh
	$(VIDEO_BLENDER) --python scripts/video/daynight.py -- --part inside \
		--day $(SCHED_OUT)/day_$(DAYNIGHT_DAY).csv --out $(DAYNIGHT_WORK) --samples $(DAYNIGHT_SAMPLES)
	uv run --no-project --with pillow python scripts/video/compose_daynight.py $(SNOW_FLAG) \
		--frames $(DAYNIGHT_WORK) --day $(SCHED_OUT)/day_$(DAYNIGHT_DAY).csv \
		--mp4 $(VIDEO_OUT)/daynight-$(DAYNIGHT_DAY).mp4 --sheet $(VIDEO_OUT)/daynight-$(DAYNIGHT_DAY)-sheet.png

# The same film with Bern outside: the scene is built once from swissBUILDINGS3D tiles into
# the cache (scripts/video/bern.py), never into heat-atlas or the repo.
BERN_BLEND ?= $(HOME)/.cache/kachel/bern/bern.blend
# Day files and kpis for the Bern film (`make bern-days`); servers come from its kpis.json.
DAYS_DIR ?= $(SCHED)/out/bern
BERN_WORK = $(VIDEO_OUT)/work/daynight-bern-$(DAYNIGHT_DAY)

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
		--samples $(DAYNIGHT_SAMPLES) --steps $(DAYNIGHT_STEPS) $(SNOW_FLAG)
	scripts/video/gpu_wait.sh
	$(VIDEO_BLENDER) --python scripts/video/daynight.py -- --part inside \
		--day $(DAYS_DIR)/day_$(DAYNIGHT_DAY).csv --out $(BERN_WORK) --samples $(DAYNIGHT_SAMPLES)
	uv run --no-project --with pillow python scripts/video/compose_daynight.py $(SNOW_FLAG) --city bern \
		--frames $(BERN_WORK) --day $(DAYS_DIR)/day_$(DAYNIGHT_DAY).csv \
		--mp4 $(VIDEO_OUT)/daynight-bern-$(DAYNIGHT_DAY).mp4 \
		--sheet $(VIDEO_OUT)/daynight-bern-$(DAYNIGHT_DAY)-sheet.png

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
