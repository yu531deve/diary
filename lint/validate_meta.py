#!/usr/bin/env python3
"""meta.yaml バリデータ（M0-2）。

使い方:
    python3 lint/validate_meta.py content/0042/meta.yaml ...
    python3 lint/validate_meta.py --all content/

辞書（fields.yaml / tags.yaml）にない値は、どのファイルのどの値が
不一致か・近い候補は何かまで表示して弾く。辞書を後から編集したとき、
既存問題のどこが壊れたか一読で分かることを受け入れ条件とする。
"""
import argparse
import datetime
import difflib
import re
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
ID_RE = re.compile(r"^\d{4}$")
STATUSES = ("draft", "published")


def load_dicts():
    fields = yaml.safe_load((REPO_ROOT / "fields.yaml").read_text())
    tags = yaml.safe_load((REPO_ROOT / "tags.yaml").read_text()) or []
    return fields, tags


def suggest(value, candidates):
    hits = difflib.get_close_matches(str(value), [str(c) for c in candidates], n=3, cutoff=0.4)
    return f"（近い候補: {', '.join(hits)}）" if hits else ""


def check_date(errors, meta, key):
    v = meta.get(key)
    if v is None:
        errors.append(f"{key}: 必須です")
    elif not isinstance(v, datetime.date):
        errors.append(f"{key}: 日付（YYYY-MM-DD）ではありません: {v!r}")


def validate_file(path: Path, fields: dict, tags: list) -> list:
    """1 ファイルを検証し、エラーメッセージのリストを返す。"""
    try:
        meta = yaml.safe_load(path.read_text())
    except yaml.YAMLError as e:
        return [f"YAML として読めません: {e}"]
    if not isinstance(meta, dict):
        return ["YAML のトップレベルが辞書ではありません"]

    errors = []

    pid = meta.get("id")
    if not isinstance(pid, str) or not ID_RE.match(pid):
        errors.append(f"id: ゼロ埋め 4 桁の文字列（例 \"0042\"）が必要です: {pid!r}")
    elif path.parent.name != pid:
        errors.append(f"id: ディレクトリ名 {path.parent.name!r} と一致しません: {pid!r}")

    if not isinstance(meta.get("title"), str) or not meta["title"].strip():
        errors.append(f"title: 空でない文字列が必要です: {meta.get('title')!r}")

    if meta.get("status") not in STATUSES:
        errors.append(f"status: {' / '.join(STATUSES)} のいずれかが必要です: {meta.get('status')!r}")

    field = meta.get("field")
    if not isinstance(field, dict):
        errors.append(f"field: major / minor を持つ辞書が必要です: {field!r}")
    else:
        major, minor = field.get("major"), field.get("minor")
        if major not in fields:
            errors.append(
                f"field.major: {major!r} は fields.yaml の大分野にありません {suggest(major, fields)}"
            )
        elif minor not in (fields[major] or []):
            errors.append(
                f"field.minor: {minor!r} は fields.yaml の「{major}」配下にありません "
                f"{suggest(minor, fields[major] or [])}（登録済み: {', '.join(fields[major] or [])}）"
            )

    tag_list = meta.get("tags")
    if not isinstance(tag_list, list):
        errors.append(f"tags: リストが必要です（空リスト可）: {tag_list!r}")
    else:
        for t in tag_list:
            if t not in tags:
                errors.append(f"tags: {t!r} は tags.yaml にありません {suggest(t, tags)}")

    diff = meta.get("difficulty")
    if not isinstance(diff, int) or isinstance(diff, bool) or not 1 <= diff <= 5:
        errors.append(f"difficulty: 1〜5 の整数が必要です（基準: docs/difficulty.md）: {diff!r}")

    check_date(errors, meta, "created")
    check_date(errors, meta, "updated")

    return errors


def main():
    ap = argparse.ArgumentParser(description="meta.yaml バリデータ")
    ap.add_argument("paths", nargs="+", help="meta.yaml のパス、または --all でディレクトリ")
    ap.add_argument("--all", action="store_true", help="ディレクトリ配下の */meta.yaml をすべて検証")
    args = ap.parse_args()

    targets = []
    for p in map(Path, args.paths):
        if args.all:
            targets.extend(sorted(p.glob("*/meta.yaml")))
        else:
            targets.append(p)

    if not targets:
        print("検証対象の meta.yaml がありません", file=sys.stderr)
        return 1

    fields, tags = load_dicts()
    ng = 0
    for path in targets:
        errors = validate_file(path, fields, tags)
        if errors:
            ng += 1
            print(f"NG {path}")
            for e in errors:
                print(f"  - {e}")
        else:
            print(f"OK {path}")

    if ng:
        print(f"\n{ng}/{len(targets)} 件のエラー。辞書（fields.yaml / tags.yaml）を変更した場合は、"
              "上記の既存問題側を修正するか辞書に値を戻してください。", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
