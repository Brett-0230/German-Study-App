/*
 * 預設單字表（範例）
 * ------------------------------------------------------------
 * 把這裡換成你自己的單字表即可；也可以在 App 的「設定 → 匯入單字」
 * 直接貼上 CSV / TSV（從 Excel、Google 試算表複製）或上傳檔案。
 *
 * 欄位：
 *   de       德文單字（必填）
 *   zh       中文意思（必填）
 *   article  冠詞 der / die / das（名詞才填）
 *   plural   複數形
 *   pos      詞性（名詞、動詞、形容詞…）
 *   ex       德文例句
 *   exZh     例句翻譯
 *   level    程度（A1、A2、B1…）
 *   cat      分類（自由填寫，例如：食物、旅行）
 */
window.DEFAULT_VOCAB = [
  { de: "Haus", article: "das", plural: "Häuser", zh: "房子", pos: "名詞", ex: "Das Haus ist groß.", exZh: "這棟房子很大。", level: "A1", cat: "範例" },
  { de: "Tisch", article: "der", plural: "Tische", zh: "桌子", pos: "名詞", ex: "Der Tisch ist aus Holz.", exZh: "這張桌子是木頭做的。", level: "A1", cat: "範例" },
  { de: "Lampe", article: "die", plural: "Lampen", zh: "燈", pos: "名詞", ex: "Die Lampe ist kaputt.", exZh: "這盞燈壞了。", level: "A1", cat: "範例" },
  { de: "lernen", zh: "學習", pos: "動詞", ex: "Ich lerne jeden Tag Deutsch.", exZh: "我每天學德文。", level: "A1", cat: "範例" },
  { de: "schön", zh: "美麗的；好的", pos: "形容詞", ex: "Das Wetter ist heute schön.", exZh: "今天天氣很好。", level: "A1", cat: "範例" }
];
