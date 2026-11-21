# Kachel: one entry point for setting up, running and checking the repo.
AGENT := services/agent

.PHONY: bootstrap dev check check-js check-py check-readme heat-loop

bootstrap:
	pnpm install --frozen-lockfile
	uv sync --project $(AGENT)

dev:
	pnpm dev

check: check-js check-py check-readme

check-js:
	pnpm format:check
	pnpm turbo run lint typecheck test build

check-py:
	uv run --project $(AGENT) ruff format --check $(AGENT)
	uv run --project $(AGENT) ruff check $(AGENT)
	uv run --project $(AGENT) pytest -q $(AGENT)

check-readme:
	node --test scripts/*.test.mjs
	pnpm readme:check

# Rebuild the heat-loop animation with Blender 5.2 and ffmpeg (see scripts/heat-loop/heat_loop.py).
BLENDER ?= blender
HEAT_LOOP_WORK ?= $(HOME)/.cache/kachel/heat-loop
HEAT_LOOP_FRAMES := $(HEAT_LOOP_WORK)/frames
HEAT_LOOP_STILL := 0060
HEAT_LOOP_PAPER := color=c=0xfbf8f3:s=1080x900:r=24
HEAT_LOOP_SCALE := scale=720:-2:flags=lanczos

heat-loop:
	rm -rf $(HEAT_LOOP_FRAMES)
	mkdir -p $(HEAT_LOOP_FRAMES) $(HOME)/.cache/kachel/tmp
	TMPDIR=$(HOME)/.cache/kachel/tmp $(BLENDER) --background --factory-startup \
		--python scripts/heat-loop/heat_loop.py -- --out $(HEAT_LOOP_FRAMES)
	ffmpeg -y -loglevel error -f lavfi -i $(HEAT_LOOP_PAPER) \
		-framerate 24 -i $(HEAT_LOOP_FRAMES)/%04d.png \
		-filter_complex "[0][1]overlay=shortest=1:format=auto,$(HEAT_LOOP_SCALE)" \
		-c:v libwebp_anim -quality 80 -compression_level 6 -loop 0 \
		packages/ui/src/heat-loop.webp
	ffmpeg -y -loglevel error -f lavfi -i $(HEAT_LOOP_PAPER) \
		-i $(HEAT_LOOP_FRAMES)/$(HEAT_LOOP_STILL).png \
		-filter_complex "[0][1]overlay=format=auto,$(HEAT_LOOP_SCALE)" \
		-frames:v 1 packages/ui/src/heat-loop-still.png
