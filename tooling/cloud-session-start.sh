#!/usr/bin/env bash
# The SessionStart hook of .claude/settings.json. Outside the cloud (CLAUDE_CODE_REMOTE unset) it
# does nothing, so local sessions keep their own toolchains. In a cloud session it puts the
# workspace toolchains on PATH for the session's commands (CLAUDE_ENV_FILE) and starts
# tooling/cloud-setup.sh in the background, as it takes longer than a hook may: its log is
# ../workingspace/cloud-setup.log, and ../workingspace/cloud-setup.status holds "ready" or
# "failed" when it ends.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

repository="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
tools="$(dirname -- "$repository")/workingspace"
mkdir -p "$tools"

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export CARGO_HOME=\"$tools/cargo\""
    echo "export RUSTUP_HOME=\"$tools/rustup\""
    echo "export PATH=\"$tools/node/bin:$tools/cargo/bin:\$PATH\""
  } >> "$CLAUDE_ENV_FILE"
fi

if [ "$(cat "$tools/cloud-setup.status" 2>/dev/null)" != "running" ]; then
  echo running > "$tools/cloud-setup.status"
  setsid bash -c "bash '$repository/tooling/cloud-setup.sh' > '$tools/cloud-setup.log' 2>&1 \
    && echo ready > '$tools/cloud-setup.status' || echo failed > '$tools/cloud-setup.status'" \
    < /dev/null > /dev/null 2>&1 &
fi
echo "Cloud setup runs in the background: see $tools/cloud-setup.log and cloud-setup.status."
