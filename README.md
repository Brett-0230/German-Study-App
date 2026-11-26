# 每日德語 German-Study-App

參考 **Daily Deutsch** 的功能設計的德文單字學習網頁 App，**單字表由你自己提供**。
純 HTML / CSS / JavaScript，不需要安裝任何套件，可加到手機主畫面離線使用（PWA）。

## 功能

| 功能 | 說明 |
|---|---|
| ☀️ 今日單字 | 每天從你的單字表挑一個字，附發音、例句 |
| 📅 每日目標 | 設定每天要學幾個新字，顯示今日進度與連續學習天數 🔥 |
| 🃏 單字卡 | 翻卡學習，依「忘記 / 困難 / 記得 / 簡單」自動安排複習（間隔重複 SRS），可切換 德→中 / 中→德 |
| ✏️ 測驗 | 看德文選中文、看中文選德文、聽力、拼字（含 ä ö ü ß 按鈕）、冠詞 der/die/das |
| 📚 單字庫 | 搜尋、篩選（未學 / 學習中 / 已熟記 / 收藏 / 常錯），點開看詳細資料 |
| ★ 收藏與錯題 | 收藏單字、答錯自動記錄，可只用收藏或常錯單字出題 |
| 🔊 發音 | 使用瀏覽器內建的德語語音（Web Speech API），可調語速 |
| 📈 統計 | 已學 / 已熟記數量、正確率、近 7 天學習量 |
| 💾 備份 | 匯出單字表 CSV、備份 / 還原學習紀錄 |

冠詞以顏色區分：<span>der 藍</span>、<span>die 粉紅</span>、<span>das 綠</span>。

## 放入你的單字表

兩種方式擇一：

1. **在 App 內匯入**：設定 → 匯入單字，從 Excel / Google 試算表複製貼上，或上傳 CSV / TSV / JSON。
2. **直接改檔案**：編輯 `data/vocab.js`，成為預設單字表。

### 欄位格式

第一列可放標題（中英文皆可）：

| 標題 | 說明 | 必填 |
|---|---|---|
| 德文 / german | 單字，名詞可寫成 `der Tisch` 會自動拆出冠詞 | ✅ |
| 中文 / meaning | 中文意思 | ✅ |
| 冠詞 / article | der / die / das | |
| 複數 / plural | 例：Tische | |
| 詞性 / pos | 名詞、動詞… | |
| 例句 / example | 德文例句 | |
| 例句翻譯 / example_zh | 例句中文 | |
| 程度 / level | A1、A2、B1… | |
| 分類 / category | 例：食物、第 3 課 | |

沒有標題列時，欄位順序視為：**德文、中文、例句、例句翻譯、冠詞、複數、詞性、程度、分類**。

範例：

```
德文	中文	複數	例句	例句翻譯	分類
der Apfel	蘋果	Äpfel	Ich esse einen Apfel.	我吃一顆蘋果。	食物
gehen	走；去		Wir gehen nach Hause.	我們回家。	動詞
```

## 執行

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

也可以直接開 `index.html`（離線快取功能需透過 http 伺服器），或部署到 GitHub Pages。

## 在 iPhone / iPad 上使用

iPhone 不能直接開電腦上的檔案，需要先把 App 放到網路上（免費的 GitHub Pages 即可）：

1. 在 GitHub 專案頁面點 **Settings → Pages**。
2. **Source** 選 `Deploy from a branch`，Branch 選放有這些檔案的分支（例如 `main`）和 `/ (root)`，按 **Save**。
3. 約 1 分鐘後會出現網址，例如 `https://你的帳號.github.io/German-Study-App/`。
4. 用 iPhone 的 **Safari** 打開這個網址（必須是 Safari）。
5. 點下方的 **分享按鈕 ⬆️ → 加入主畫面**，主畫面就會出現「每日德語」圖示，之後像 App 一樣全螢幕開啟，也可離線使用。

> 注意：免費帳號的 GitHub Pages 只支援 **公開（Public）** 的專案。

iPhone 小提醒：
- 第一次發音前需要先點一下畫面（iOS 的規定），之後就會自動播放。
- 若聽不到聲音，請確認手機側邊的**靜音開關**沒有開啟。
- 想要更自然的德語發音：設定 → 輔助使用 → 朗讀內容 → 聲音 → 德文，下載「Anna（加強版）」。
- 「加入主畫面」的 App 與 Safari 的學習紀錄是分開的；備份檔可透過分享選單存到「檔案」App。

## 檔案結構

```
index.html      頁面骨架
styles.css      樣式（支援深色模式）
app.js          所有功能邏輯
data/vocab.js   預設單字表（換成你的）
sw.js           離線快取
manifest.json   PWA 設定
```

學習紀錄存在瀏覽器的 localStorage，換裝置前請先在「設定 → 備份學習紀錄」匯出。
