#!/bin/sh
# Run one pitch shot script with the Python packages it needs: scripts/pitch/run.sh shot05_basel_to_switzerland.py
cd "$(dirname "$0")" && exec uv run -q --no-project --with pillow --with numpy --with pyproj python -B "$@"
