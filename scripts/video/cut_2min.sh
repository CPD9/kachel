#!/usr/bin/env bash
# The two-minute pitch cut, in the order of the talk track in docs/pitch.md: January
# day-night (30.5 s), setup (15.5 s), scheduler (25.5 s), break-even and payback (each held
# on its last frame, 20.5 s together), the live demo letterboxed (20.5 s) and the July
# evening from 15:00 to 22:00 to close (10.5 s). Clips are only sped up, held or trimmed;
# every figure stays as rendered. Six 0.5 s cross-fades bring it to 120 s.
#   scripts/video/cut_2min.sh <video dir> <charts dir> <out.mp4>
set -euo pipefail
V=$1 C=$2 OUT=$3
P=0xFAF8F5
std="fps=24,format=yuv420p,setsar=1"
ffmpeg -loglevel error -y \
	-i "$V/daynight-january.mp4" -i "$V/02-setup.mp4" -i "$V/03-scheduler.mp4" \
	-i "$C/breakeven.mp4" -i "$C/payback.mp4" -i "$V/release/live-demo.mp4" \
	-ss 22.5 -t 10.5 -i "$V/daynight-july.mp4" \
	-filter_complex "\
[0]setpts=PTS*30.5/36,$std[a];[1]setpts=PTS*15.5/20,$std[b];[2]$std[c];\
[3]tpad=stop_mode=clone:stop_duration=2.25,$std[d];[4]tpad=stop_mode=clone:stop_duration=2.25,$std[e];\
[5]trim=0:20.5,setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,\
pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$P,$std[f];[6]setpts=PTS-STARTPTS,$std[g];\
[a][b]xfade=transition=fade:duration=0.5:offset=30[ab];\
[ab][c]xfade=transition=fade:duration=0.5:offset=45[abc];\
[abc][d]xfade=transition=fade:duration=0.5:offset=70[abcd];\
[abcd][e]xfade=transition=fade:duration=0.5:offset=79.75[abcde];\
[abcde][f]xfade=transition=fade:duration=0.5:offset=89.5[abcdef];\
[abcdef][g]xfade=transition=fade:duration=0.5:offset=109.5,format=yuv420p[out]" \
	-map "[out]" -an -c:v libx264 -crf 20 -preset slow -movflags +faststart "$OUT"
ffmpeg -loglevel error -y -i "$OUT" -vf scale=1280:720:flags=lanczos \
	-c:v libx264 -crf 26 -preset slow -movflags +faststart "${OUT%.mp4}-720p.mp4"
