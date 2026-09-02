export type ShortcutItem = { action: string; keys: string[] };

/**
 * The help dialog's source of truth. Every branch in `useGraphEditor`'s key
 * handler has a row here; `editorShortcuts.test.ts` checks the two agree.
 */
export const EDITOR_SHORTCUT_GROUPS: Array<{ label: string; items: ShortcutItem[] }> = [
  {
    label: "作成・編集",
    items: [
      { action: "ノードを追加", keys: ["N"] },
      { action: "子ノードを追加", keys: ["Tab"] },
      { action: "選択したノードを編集", keys: ["Enter"] },
      { action: "つながりのラベルを編集（つながり選択時）", keys: ["Enter"] },
      { action: "選択したノードを複製", keys: ["Mod", "D"] },
    ],
  },
  {
    label: "移動・検索",
    items: [
      { action: "最初のノードを選ぶ", keys: ["F"] },
      { action: "近くのノードへ移動", keys: ["矢印"] },
      { action: "選択したノードを移動", keys: ["Shift", "矢印"] },
      { action: "選択したノードを少し移動", keys: ["Shift", "Alt", "矢印"] },
      { action: "ノードを検索", keys: ["Mod", "K"] },
    ],
  },
  {
    label: "接続・選択",
    items: [
      { action: "選択したノードをつなぐ", keys: ["L"] },
      { action: "下位ノードを選択", keys: ["C"] },
      { action: "下位ノードを折りたたむ / 開く", keys: ["H"] },
      { action: "選択を解除", keys: ["Esc"] },
    ],
  },
  {
    label: "整理・復元",
    items: [
      { action: "自動整列", keys: ["A"] },
      { action: "元に戻す", keys: ["Mod", "Z"] },
      { action: "やり直す", keys: ["Mod", "Shift", "Z"] },
      { action: "選択を削除", keys: ["Delete"] },
      { action: "下位ごと削除", keys: ["Shift", "Delete"] },
    ],
  },
  {
    label: "ナビゲーション",
    items: [
      { action: "操作ヘルプ", keys: ["?"] },
      { action: "ノート一覧へ戻る", keys: ["Mod", "["] },
      { action: "バックアップを保存", keys: ["Mod", "E"] },
    ],
  },
];

export function shortcutKey(key: string) {
  if (key !== "Mod") return key;
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
}
