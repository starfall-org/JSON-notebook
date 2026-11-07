#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export PATH="${FLUTTER_HOME:-$HOME/flutter}/bin:${ANDROID_HOME:-/opt/android-sdk}/platform-tools:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
PID_FILE="${FLUTTER_PID_FILE:-/tmp/json-notebook-flutter.pid}"
LOG_FILE="${FLUTTER_LOG_FILE:-/tmp/json-notebook-flutter.log}"
LAUNCH_PID_FILE="${FLUTTER_LAUNCH_PID_FILE:-/tmp/json-notebook-flutter-launch.pid}"
APK="build/app/outputs/flutter-apk/app-debug.apk"
DEVICE="${FLUTTER_DEVICE:-}"
if [[ -z "$DEVICE" ]]; then
  DEVICE="$(timeout 8 adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}')"
fi
launch_pid() {
  if [[ -f "$LAUNCH_PID_FILE" ]]; then
    local pid
    pid="$(cat "$LAUNCH_PID_FILE")"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      printf '%s\n' "$pid"
      return 0
    fi
  fi
  return 1
}
active_pid() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      printf '%s\n' "$pid"
      return 0
    fi
  fi
  return 1
}
case "${1:-status}" in
  start)
    if pid="$(active_pid)"; then echo "Flutter debug is running: PID=$pid"; exit 0; fi
    if pid="$(launch_pid)"; then echo "Flutter debug is starting: PID=$pid"; exit 0; fi
    if [[ -z "$DEVICE" ]]; then echo 'No ADB device connected' >&2; exit 1; fi
    if ! timeout 10 adb -s "$DEVICE" get-state 2>/dev/null | grep -q '^device$'; then
      echo "ADB device unavailable: $DEVICE" >&2; exit 1
    fi
    echo "Starting Flutter debug on $DEVICE (log: $LOG_FILE)"
    # An already-built debug APK avoids repeating a resource-heavy Gradle build.
    launch_args=()
    if [[ -f "$APK" ]]; then
      launch_args+=("--use-application-binary=$APK")
    elif [[ $(df -Pk . | awk "END {print \$4}") -lt 2097152 ]]; then
      echo "Refusing Gradle build: less than 2 GiB disk free" >&2
      exit 1
    fi
    nohup flutter run -d "$DEVICE" --debug --device-timeout=30 --pid-file="$PID_FILE" "${launch_args[@]}" > "$LOG_FILE" 2>&1 </dev/null &
    echo "$!" > "$LAUNCH_PID_FILE"
    echo "Flutter launcher PID=$!"
    ;;
  reload)
    pid="$(active_pid)" || { echo 'Flutter debug not running'; exit 1; }
    kill -USR1 "$pid"
    echo "Hot reload requested (PID=$pid)"
    ;;
  restart)
    pid="$(active_pid)" || { echo 'Flutter debug not running'; exit 1; }
    kill -USR2 "$pid"
    echo "Hot restart requested (PID=$pid)"
    ;;
  status)
    if pid="$(active_pid)"; then echo "Flutter debug running (PID=$pid)"; elif pid="$(launch_pid)"; then echo "Flutter starting (PID=$pid)"; else echo 'Flutter debug not running'; fi
    if [[ -f "$LOG_FILE" ]]; then tail -n 18 "$LOG_FILE"; fi
    ;;
  stop)
    pid="$(active_pid)" || pid="$(launch_pid)" || { echo 'Flutter debug not running'; exit 0; }
    kill -TERM "$pid"
    echo "Stopping Flutter debug (PID=$pid)"
    ;;
  *) echo "Usage: $0 {start|reload|restart|status|stop}" >&2; exit 2 ;;
esac
