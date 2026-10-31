#!/usr/bin/env bash
# Build three signed Flutter APKs without overwhelming a small, no-swap host.
# Includes a mandatory AOT library check: a missing libapp.so crashes on launch.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v flutter >/dev/null || { echo 'Flutter must be on PATH' >&2; exit 2; }
command -v taskset >/dev/null || { echo 'taskset must be available' >&2; exit 2; }
test -s release.jks && test -s .env || {
  echo 'release.jks and .env are required for signing' >&2
  exit 2
}

free_disk_kb=$(df -Pk . | awk 'NR==2 {print $4}')
free_ram_kb=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
free_shm_kb=$(df -Pk /dev/shm | awk 'NR==2 {print $4}')
if (( free_disk_kb < 700000 || free_ram_kb < 2500000 || free_shm_kb < 1500000 )); then
  echo 'Not enough free disk, memory, or /dev/shm for a safe release build' >&2
  exit 2
fi

# Avoid multiple Gradle builds competing for resources.
if pgrep -f 'flutter_tools.snapshot build apk' >/dev/null ||
   pgrep -f 'GradleDaemon.*assembleRelease' >/dev/null; then
  echo 'Another APK release build appears to be active' >&2
  exit 2
fi

intermediates='build/app/intermediates'
original="build/app/intermediates.before-release.$$"
ram_dir="/dev/shm/secrets-keep-release-$$"
mkdir -p build/app "$ram_dir"
if [[ -L "$intermediates" ]]; then
  echo 'Refusing to replace an existing intermediates symlink' >&2
  rmdir "$ram_dir"
  exit 2
fi
if [[ -e "$intermediates" ]]; then
  mv "$intermediates" "$original"
fi
ln -s "$ram_dir" "$intermediates"
cleanup() {
  # Remove only our own symlink; do not erase unrelated build artifacts.
  if [[ -L "$intermediates" && "$(readlink "$intermediates")" == "$ram_dir" ]]; then
    rm "$intermediates"
  fi
  if [[ -d "$original" ]]; then
    mv "$original" "$intermediates"
  fi
  rm -rf -- "$ram_dir"
}
trap cleanup EXIT

export JAVA_TOOL_OPTIONS='-XX:ActiveProcessorCount=2'
echo 'Building split-ABI release with two CPUs, Gradle workers.max=1, and temporary RAM intermediates.'
nice -n 10 ionice -c2 -n7 taskset -c 0,1 flutter build apk --release --split-per-abi --no-pub

# Some Flutter/AGP combinations omit libapp.so despite completing the build.
# This check MUST pass before any APK is uploaded or shared.
python3 scripts/verify-release-apks.py --repair
echo 'Signed split APKs are ready in build/app/outputs/flutter-apk/'
