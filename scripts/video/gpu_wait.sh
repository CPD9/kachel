#!/usr/bin/env bash
# Wait until no other Blender process holds the GPU: only one Cycles job runs at a time.
set -euo pipefail
while nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader | grep -qi blender; do
	echo "GPU busy with another Blender job; waiting 60 s"
	sleep 60
done
