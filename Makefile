# Kachel: one entry point for setting up, running and checking the repo.
AGENT := services/agent
SCHED := services/scheduler

.PHONY: bootstrap dev db-stop db-reset check check-js check-py check-readme heat-loop year video-charts

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

check: check-js check-py check-readme

check-js:
	pnpm format:check
	pnpm turbo run lint typecheck test build

check-py:
	uv run --project $(AGENT) ruff format --check $(AGENT)
	uv run --project $(AGENT) ruff check $(AGENT)
	uv run --project $(AGENT) pytest -q $(AGENT)
	cd $(SCHED) && uv run ruff format --check && uv run ruff check && uv run pytest -q

# The yearly balance on the saved Basel 2025 weather: out/kpis.json, hourly.csv and the
# January and July day CSVs (the animation reads those two), plus the plots.
year:
	cd $(SCHED) && uv run python run_year.py --weather tests/data/weather_basel_2025.csv

check-readme:
	node --test scripts/*.test.mjs
	pnpm readme:check

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

.PHONY: video-setup video-scheduler video-glb

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
