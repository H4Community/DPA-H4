"""
Extract the top-left FRONT pose from each Floor Kids model sheet in Characters/,
remove the off-white paper background with flood-fill + edge anti-aliasing,
keep the main character component (filtering stray splatters/ticks/labels),
and export transparent RGBA PNGs to images/characters/.
"""

from collections import deque
from pathlib import Path
import math
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "Characters"
OUT_DIR = ROOT / "images" / "characters"

SKIP_FILES = {"roster.png"}


def rgb_dist(c1: tuple[int, int, int], c2: tuple[int, int, int]) -> float:
    return math.sqrt(
        (c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2
    )


def estimate_bg_color(img: Image.Image) -> tuple[int, int, int]:
    """Estimate the off-white paper color from light pixels along the ROI border."""
    px = img.load()
    w, h = img.size
    samples = []
    for x in range(w):
        for y in (0, 1, h - 2, h - 1):
            r, g, b = px[x, y][:3]
            if r > 205 and g > 195 and b > 170:
                samples.append((r, g, b))
    for y in range(h):
        for x in (0, 1, w - 2, w - 1):
            r, g, b = px[x, y][:3]
            if r > 205 and g > 195 and b > 170:
                samples.append((r, g, b))
    if not samples:
        return (245, 232, 210)
    samples.sort()
    mid = samples[len(samples) // 2]
    return mid


def flood_fill_bg(img: Image.Image, bg_rgb: tuple[int, int, int], tol: float = 68.0) -> list[list[bool]]:
    """Flood-fill background from all 4 borders of the ROI."""
    px = img.load()
    w, h = img.size
    is_bg = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def is_paper(r: int, g: int, b: int) -> bool:
        # Paper (including warm vignette edges) is bright and low-to-moderate saturation
        return (
            rgb_dist((r, g, b), bg_rgb) <= tol
            and min(r, g, b) >= 150
            and (max(r, g, b) - min(r, g, b)) <= 68
        )

    for x in range(w):
        for y in (0, h - 1):
            r, g, b = px[x, y][:3]
            if is_paper(r, g, b) and not is_bg[y][x]:
                is_bg[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            r, g, b = px[x, y][:3]
            if is_paper(r, g, b) and not is_bg[y][x]:
                is_bg[y][x] = True
                q.append((x, y))

    while q:
        cx, cy = q.popleft()
        for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
            if 0 <= nx < w and 0 <= ny < h and not is_bg[ny][nx]:
                r, g, b = px[nx, ny][:3]
                if is_paper(r, g, b):
                    is_bg[ny][nx] = True
                    q.append((nx, ny))

    return is_bg


def keep_largest_component(is_bg: list[list[bool]], w: int, h: int) -> list[list[bool]]:
    """Keep only the largest foreground connected component (removes stray ticks/splatters)."""
    visited = [[False] * w for _ in range(h)]
    best_comp: list[tuple[int, int]] = []

    for y in range(h):
        for x in range(w):
            if not is_bg[y][x] and not visited[y][x]:
                comp: list[tuple[int, int]] = []
                q = deque([(x, y)])
                visited[y][x] = True
                while q:
                    cx, cy = q.popleft()
                    comp.append((cx, cy))
                    for nx, ny in (
                        (cx + 1, cy),
                        (cx - 1, cy),
                        (cx, cy + 1),
                        (cx, cy - 1),
                        (cx + 1, cy + 1),
                        (cx - 1, cy - 1),
                        (cx + 1, cy - 1),
                        (cx - 1, cy + 1),
                    ):
                        if 0 <= nx < w and 0 <= ny < h and not is_bg[ny][nx] and not visited[ny][nx]:
                            visited[ny][nx] = True
                            q.append((nx, ny))
                if len(comp) > len(best_comp):
                    best_comp = comp

    keep = [[True] * w for _ in range(h)]
    for x, y in best_comp:
        keep[y][x] = False
    return keep


def clear_enclosed_paper_between_legs(
    img: Image.Image, is_bg: list[list[bool]], bg_rgb: tuple[int, int, int], tol: float = 68.0
) -> None:
    """
    If ground shadow lines seal the gap between the legs, flood-fill any
    enclosed paper-colored pocket in the lower-middle region (55%-95% height).
    """
    px = img.load()
    w, h = img.size
    visited = [[False] * w for _ in range(h)]
    y_min = int(h * 0.55)
    y_max = int(h * 0.95)
    x_min = int(w * 0.30)
    x_max = int(w * 0.70)

    def is_paper_strict(r: int, g: int, b: int) -> bool:
        return (
            rgb_dist((r, g, b), bg_rgb) <= tol
            and min(r, g, b) >= 150
            and (max(r, g, b) - min(r, g, b)) <= 68
        )

    for y in range(y_min, y_max):
        for x in range(x_min, x_max):
            if not is_bg[y][x] and not visited[y][x]:
                r, g, b = px[x, y][:3]
                if not is_paper_strict(r, g, b):
                    continue
                comp = []
                touches_edge = False
                q = deque([(x, y)])
                visited[y][x] = True
                while q:
                    cx, cy = q.popleft()
                    comp.append((cx, cy))
                    if cx == 0 or cx == w - 1 or cy == 0 or cy == h - 1:
                        touches_edge = True
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and not is_bg[ny][nx] and not visited[ny][nx]:
                            nr, ng, nb = px[nx, ny][:3]
                            if is_paper_strict(nr, ng, nb):
                                visited[ny][nx] = True
                                q.append((nx, ny))
                # Only clear moderate-sized enclosed pockets between legs
                if not touches_edge and 150 <= len(comp) <= (w * h * 0.12):
                    for cx, cy in comp:
                        is_bg[cy][cx] = True


def apply_alpha_and_defringe(
    img: Image.Image, is_bg: list[list[bool]], bg_rgb: tuple[int, int, int]
) -> Image.Image:
    """Convert to RGBA, set background alpha=0, and soften 1px edge halo."""
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size

    for y in range(h):
        for x in range(w):
            if is_bg[y][x]:
                px[x, y] = (0, 0, 0, 0)

    # Soften 1px border pixels that are blended with the cream paper
    edge_updates: list[tuple[int, int, tuple[int, int, int, int]]] = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if is_bg[y][x]:
                continue
            adj_bg = sum(
                1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                if is_bg[ny][nx]
            )
            if adj_bg > 0:
                r, g, b, _ = px[x, y]
                dist = rgb_dist((r, g, b), bg_rgb)
                if dist < 75 and min(r, g, b) > 130:
                    alpha = int(max(0, min(255, (dist / 75.0) * 255)))
                    edge_updates.append((x, y, (r, g, b, alpha)))

    for x, y, val in edge_updates:
        px[x, y] = val

    return rgba


def process_sheet(src_path: Path, out_path: Path) -> tuple[int, int]:
    im = Image.open(src_path).convert("RGB")
    w, h = im.size

    # Top-left FRONT pose ROI (normalized for both 1024x1536 and 1086x1448 sheets)
    roi_box = (
        0,
        int(h * 0.091),
        int(w * 0.355),
        int(h * 0.398),
    )
    roi = im.crop(roi_box)
    rw, rh = roi.size

    bg_rgb = estimate_bg_color(roi)
    is_bg = flood_fill_bg(roi, bg_rgb, tol=68.0)
    is_bg = keep_largest_component(is_bg, rw, rh)
    clear_enclosed_paper_between_legs(roi, is_bg, bg_rgb, tol=68.0)

    rgba = apply_alpha_and_defringe(roi, is_bg, bg_rgb)
    bbox = rgba.getbbox()
    if bbox:
        # Add small 8px transparent padding
        pad = 8
        crop_box = (
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(rw, bbox[2] + pad),
            min(rh, bbox[3] + pad),
        )
        rgba = rgba.crop(crop_box)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(out_path, "PNG")
    return rgba.size


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sheets = sorted(p for p in SRC_DIR.glob("*.png") if p.name.lower() not in SKIP_FILES)
    for sheet in sheets:
        out_path = OUT_DIR / sheet.name.lower()
        size = process_sheet(sheet, out_path)
        print(f"Exported {out_path.relative_to(ROOT)} -> {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()
