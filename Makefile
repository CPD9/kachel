# Kachel: one entry point for setting up, running and checking the repo.
AGENT := services/agent
SCHED := services/scheduler

.PHONY: bootstrap dev db-stop db-reset check check-js check-py check-readme heat-loop year

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
