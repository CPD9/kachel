#!/usr/bin/env bash
# Build kachel-submission.zip for the hackathon form: the model paper, the slides, the newest
# pitch film, the demo checklist and a README-FIRST.txt that names each file in plain words.
#
#   scripts/submission/zip.sh                 build into ~/.cache/kachel/submission
#   OUT=/some/dir scripts/submission/zip.sh   build somewhere else
#   FILM=/path/to/cut.mp4 scripts/submission/zip.sh   pick the film yourself
#   FILM_NOTE="..." sets what README-FIRST.txt says about the film
#
# Without FILM the newest 1080p rough cut in ~/.cache/kachel/pitch/edit is used, and without one
# of those the draft film is downloaded from the media-v1 release. The zip is never committed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="${OUT:-$HOME/.cache/kachel/submission}"
EDIT="${EDIT:-$HOME/.cache/kachel/pitch/edit}"
RELEASE_FILM="https://github.com/CPD9/kachel/releases/download/media-v1/kachel-pitch-draft.mp4"
LIMIT=$((500 * 1000 * 1000))

stage="$OUT/kachel-submission"
rm -rf "$stage"
mkdir -p "$stage"

film="${FILM:-}"
if [ -z "$film" ]; then
  film="$(ls -t "$EDIT"/rough-cut-*.mp4 2>/dev/null | grep -v -- '-720p\.mp4$' | head -n 1 || true)"
fi
if [ -z "$film" ]; then
  film="$OUT/kachel-pitch-draft.mp4"
  curl -fsSL -o "$film" "$RELEASE_FILM"
fi

# What README-FIRST.txt says about the film: draft wording for a rough cut or the release draft,
# plain wording otherwise. FILM_NOTE overrides both.
case "$(basename "$film")" in
  rough-cut-* | kachel-pitch-draft*)
    default_note="A draft cut without voice; the final cut with the
                       voice-over replaces it in the media-v1 release on GitHub." ;;
  *) default_note="With the voice-over." ;;
esac
film_note="${FILM_NOTE:-$default_note}"

cp "$ROOT/docs/paper/kachel-model.pdf" "$stage/1-model-paper.pdf"
cp "$ROOT/docs/pitch/slides.pdf" "$stage/2-slides.pdf"
cp "$film" "$stage/3-pitch-film.mp4"
cp "$ROOT/docs/demo-checklist.md" "$stage/4-demo-checklist.md"

commit="$(git -C "$ROOT" rev-parse --short HEAD)"
cat >"$stage/README-FIRST.txt" <<EOF
Kachel: small servers in a home's basement run AI jobs, and their heat warms the house.
Code, setup steps and every assumption: https://github.com/CPD9/kachel
Built from commit $commit on $(date -u +%Y-%m-%d).

1-model-paper.pdf      The model paper: the reference house, the scheduler, the yearly balance,
                       every assumption with its source, and when it does not pay off.
2-slides.pdf           The two pitch slides. Every figure comes from the model's output files.
3-pitch-film.mp4       The pitch film, 1080p. $film_note
4-demo-checklist.md    The steps for the live demo: start the database and the apps, run a real
                       job, and pause and resume it from the heat signal.
README-FIRST.txt       This file.

The figures in the paper and on the slides are for one reference house in Basel with six
1 kW servers on real 2025 weather. The fleet houses, buyer accounts and the demo data in the
apps are synthetic; the paper says which is which.
EOF

zip_path="$OUT/kachel-submission.zip"
rm -f "$zip_path"
(cd "$OUT" && zip -q -r -X "$zip_path" "kachel-submission")

size="$(stat -c %s "$zip_path" 2>/dev/null || stat -f %z "$zip_path")"
if [ "$size" -ge "$LIMIT" ]; then
  echo "kachel-submission.zip is $size bytes, over the 500 MB limit" >&2
  exit 1
fi
echo "$zip_path: $((size / 1000 / 1000)) MB ($size bytes), film from $film"
