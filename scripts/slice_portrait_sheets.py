#!/usr/bin/env python3
"""
把「整张多格立绘」切成单张立绘，写入 data/portraits 并更新 index.json。

默认按等分网格切：适合 5 列 × 2 行、每格一张半身像的拼图。
网页里的「立绘 · 导入整图」做的是同一件事，这个脚本只是方便在本地批量处理。

用法：
    python scripts/slice_portrait_sheets.py "data/立绘全图" --rows 2 --cols 5
    python scripts/slice_portrait_sheets.py "data/立绘全图" --gender male --prefix 立绘
"""

import argparse
import hashlib
import json
import os
import time
from glob import glob

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUTPUT = os.path.join(ROOT, "data", "portraits")


def load_index(index_path):
    if not os.path.exists(index_path):
        return {"version": 1, "portraits": []}
    try:
        with open(index_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data.get("portraits"), list):
            data["portraits"] = []
        return data
    except (OSError, ValueError):
        return {"version": 1, "portraits": []}


def save_index(index_path, data):
    tmp = index_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, index_path)


def portrait_id(source, row, col):
    digest = hashlib.sha1(f"{source}:{row}:{col}".encode("utf-8")).hexdigest()
    return f"pt_{digest[:12]}"


def main():
    parser = argparse.ArgumentParser(description="切分立绘拼图")
    parser.add_argument("input", nargs="?", default=os.path.join(ROOT, "data", "立绘全图"))
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--rows", type=int, default=2)
    parser.add_argument("--cols", type=int, default=5)
    parser.add_argument("--gender", default="male", choices=["male", "female", "all"])
    parser.add_argument("--prefix", default="立绘")
    parser.add_argument("--quality", type=int, default=90)
    parser.add_argument("--max-width", type=int, default=720)
    args = parser.parse_args()

    if not os.path.isdir(args.input):
        raise SystemExit(f"找不到输入目录：{args.input}")
    if args.rows <= 0 or args.cols <= 0:
        raise SystemExit("rows / cols 必须是正整数")

    os.makedirs(args.output, exist_ok=True)
    index_path = os.path.join(args.output, "index.json")
    index = load_index(index_path)
    existing = {item.get("id") for item in index["portraits"]}
    used_cells = {(item.get("source"), item.get("cell")) for item in index["portraits"]}

    files = sorted(
        path for path in glob(os.path.join(args.input, "*"))
        if path.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
    )
    if not files:
        raise SystemExit(f"{args.input} 里没有图片")

    added = 0
    skipped = 0
    for path in files:
        source = os.path.basename(path)
        with Image.open(path) as image:
            image = image.convert("RGB")
            width, height = image.size
            for row in range(args.rows):
                for col in range(args.cols):
                    cell = f"{row}-{col}"
                    pid = portrait_id(source, row, col)
                    if (source, cell) in used_cells or pid in existing:
                        skipped += 1
                        continue

                    box = (
                        round(col * width / args.cols),
                        round(row * height / args.rows),
                        round((col + 1) * width / args.cols),
                        round((row + 1) * height / args.rows),
                    )
                    crop = image.crop(box)
                    if crop.width > args.max_width:
                        ratio = args.max_width / crop.width
                        crop = crop.resize(
                            (args.max_width, round(crop.height * ratio)),
                            Image.LANCZOS,
                        )

                    filename = f"{pid}.webp"
                    crop.save(
                        os.path.join(args.output, filename),
                        "WEBP",
                        quality=args.quality,
                        method=6,
                    )
                    index["portraits"].append({
                        "id": pid,
                        "file": filename,
                        "name": f"{args.prefix} {len(index['portraits']) + 1:02d}",
                        "gender": args.gender,
                        "width": crop.width,
                        "height": crop.height,
                        "source": source,
                        "cell": cell,
                        "createdAt": int(time.time() * 1000),
                    })
                    existing.add(pid)
                    used_cells.add((source, cell))
                    added += 1

    save_index(index_path, index)
    print(f"完成：新增 {added} 张，跳过 {skipped} 张，累计 {len(index['portraits'])} 张")
    print(f"输出目录：{args.output}")


if __name__ == "__main__":
    main()
