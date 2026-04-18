# Yoink — Design Assets

## Icon

Source PNG: [`yoink-icon.png`](./yoink-icon.png) (1024×1024).

Picked from four SnapAI candidates (`icon-candidates/v1`–`v4`). v1 (Y-grappling-hook) chosen for on-brand read.

To swap: drop a new 1024×1024 PNG at `design/yoink-icon.png`, then:

```bash
cd src-tauri
bun x @tauri-apps/cli icon ../design/yoink-icon.png
```

Regenerate candidates with SnapAI:

```bash
bunx snapai icon -o ./icon-candidates/vN -q high -p "<prompt>"
```

## Candidates

- `icon-candidates/v1` — stylised Y as grappling hook (picked)
- `icon-candidates/v2` — two arrows between ports, duotone teal
- `icon-candidates/v3` — minimalist tentacle wrapping a folder
- `icon-candidates/v4` — isometric cube with interlocking up/down arrows
