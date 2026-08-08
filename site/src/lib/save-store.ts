// site/src/lib/save-store.ts
//
// issue #69: 保存（☆）機能。localStorage バックエンドの任意機能。
//
// 受け入れ条件（必須）: localStorage が使えない環境（プライベートブラウジング等で
// アクセス自体が例外を投げる場合や、そもそも未対応の環境）では、☆ボタンは
// 無効表示（disabled/inert）になり、それ以外の機能（ページ閲覧・PDF・検索等）は
// 一切壊れないこと。そのため、このモジュールは一切 throw しない。すべての
// 失敗は false / 空配列にフォールバックする。
//
// site/CLAUDE.md 禁止事項「localStorage 等への依存を前提とした必須機能の実装」
// に反しないよう、保存機能はあくまで付加的なブックマークであり、他のどの
// ページ・機能もこのモジュールの成否に依存しない設計にしている。

const STORAGE_KEY = "diary:saved-problems";

/**
 * localStorage が実際に読み書きできるかを判定する。
 * 存在チェックだけでなく setItem/removeItem を試すのは、Safari の
 * プライベートブラウジングのように `localStorage` オブジェクト自体は
 * 存在するが操作すると例外を投げる環境があるため。
 */
export function isStorageAvailable(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const probeKey = "diary:storage-probe";
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

function readAll(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function writeAll(ids: string[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

/** 保存済み問題 ID の一覧（新しく保存した順）。取得できない場合は空配列。 */
export function listSaved(): string[] {
  if (!isStorageAvailable()) return [];
  return readAll();
}

export function isSaved(id: string): boolean {
  if (!isStorageAvailable()) return false;
  return readAll().includes(id);
}

/** 保存 / 解除をトグルする。成功時は変更後の保存状態を返す。失敗時は常に false。 */
export function toggleSaved(id: string): boolean {
  if (!isStorageAvailable()) return false;
  const current = readAll();
  const idx = current.indexOf(id);
  let next: string[];
  let nowSaved: boolean;
  if (idx >= 0) {
    next = current.filter((v) => v !== id);
    nowSaved = false;
  } else {
    next = [id, ...current];
    nowSaved = true;
  }
  const ok = writeAll(next);
  return ok && nowSaved;
}
