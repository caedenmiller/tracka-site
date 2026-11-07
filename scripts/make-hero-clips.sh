#!/bin/bash
# The hero's three phone clips, from three iPhone screen recordings.
#
#   scripts/make-hero-clips.sh <profile.mov> <binder.mov> <shows.mov>
#
# Writes clips/hero-profile.mp4, clips/hero-binder.mp4, clips/hero-shows.mp4 and a
# poster (.jpg, the clip's first frame) for each, which is everything index.html
# loads for the hero. Then bump the ?v= on the six hero URLs in index.html.
#
# Each recording: the status bar and the home indicator are painted black (the
# app is dark, so they read as the phone's own black; the frame's island sits on
# top), trimmed to DUR seconds from START, scaled to 540 wide in the screen's
# shape, muted, H.264 with faststart so it plays while it downloads.
# Smoothness: it keeps the recording's frame rate (60 for an iPhone recording,
# capped at 60, never fewer frames than the source) and encodes at a quality
# where a fast scroll doesn't smear (CRF 22, up to 5 Mbit/s).
#
# Optional settings (seconds or fractions of the height):
#   START=0.8 DUR=4            for all three, or per clip (4 s: the reel turns
#                              to the next phone when a clip ends):
#   START_PROFILE, DUR_PROFILE, START_BINDER, DUR_BINDER, START_SHOWS, DUR_SHOWS
#   TOP=0.064 BOTTOM=0.03      how much of the top and bottom to black out
#   TOP_PROFILE, TOP_BINDER, TOP_SHOWS   per clip
#   W=540 CRF=22 FPS=auto      width, quality (lower CRF = sharper, heavier), frame rate
# e.g. START_BINDER=2.5 DUR_BINDER=6 scripts/make-hero-clips.sh a.mov b.mov c.mov
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "usage: $0 <profile.mov> <binder.mov> <shows.mov>" >&2
  exit 1
fi
for f in "$@"; do [ -f "$f" ] || { echo "not found: $f" >&2; exit 1; }; done

FF=$(command -v ffmpeg || echo /opt/homebrew/bin/ffmpeg)
FFPROBE="${FF%ffmpeg}ffprobe"
[ -x "$FF" ] && [ -x "$FFPROBE" ] || { echo "ffmpeg not found (brew install ffmpeg)" >&2; exit 1; }
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/clips"
mkdir -p "$OUT"

W=${W:-540}
H=$(( (W * 2622 / 1206 + 1) / 2 * 2 ))   # the frame's screen shape (1206 x 2622), even
CRF=${CRF:-22}

make() { # name input start dur top
  local name=$1 in=$2 start=$3 dur=$4 top=$5 bottom=${BOTTOM:-0.03}
  local mp4="$OUT/hero-$name.mp4" jpg="$OUT/hero-$name.jpg" fps=${FPS:-auto}
  if [ "$fps" = auto ]; then
    # the source's own rate (iPhone recordings say 60; variable-rate ones are
    # filled out to it, so no frame is dropped), capped at 60
    local r; r=$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$in")
    fps=$(awk -v r="$r" 'BEGIN { split(r, a, "/"); f = (a[2] > 0) ? a[1] / a[2] : a[1]; print (f >= 50) ? 60 : 30 }')
  fi
  "$FF" -hide_banner -loglevel error -y -ss "$start" -t "$dur" -i "$in" -an \
    -vf "setpts=PTS-STARTPTS,fps=$fps,scale=$W:$H:force_original_aspect_ratio=increase:flags=lanczos,crop=$W:$H,drawbox=x=0:y=0:w=iw:h=ih*$top:color=black:t=fill,drawbox=x=0:y=ih*(1-$bottom):w=iw:h=ih*$bottom+2:color=black:t=fill,format=yuv420p" \
    -c:v libx264 -profile:v high -level 4.2 -preset slow -crf "$CRF" -maxrate 5M -bufsize 10M -g $((fps * 2)) -movflags +faststart "$mp4"
  "$FF" -hide_banner -loglevel error -y -i "$mp4" -frames:v 1 -q:v 6 "$jpg"
  printf '%-8s %6s KB mp4  %5s KB poster  %ss at %s fps\n' "$name" \
    "$(( $(stat -f%z "$mp4") / 1024 ))" "$(( $(stat -f%z "$jpg") / 1024 ))" \
    "$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$mp4" 2>/dev/null | cut -c1-4)" "$fps"
}

make profile "$1" "${START_PROFILE:-${START:-0.8}}" "${DUR_PROFILE:-${DUR:-4}}" "${TOP_PROFILE:-${TOP:-0.064}}"
make binder  "$2" "${START_BINDER:-${START:-0.8}}"  "${DUR_BINDER:-${DUR:-4}}"  "${TOP_BINDER:-${TOP:-0.064}}"
make shows   "$3" "${START_SHOWS:-${START:-0.8}}"   "${DUR_SHOWS:-${DUR:-4}}"   "${TOP_SHOWS:-${TOP:-0.064}}"
echo "Wrote $OUT. Bump the hero ?v= in index.html, then look at it on a phone."
