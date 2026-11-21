# Kachel: one entry point for setting up, running and checking the repo.
AGENT := services/agent

.PHONY: bootstrap dev check check-js check-py check-readme

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
