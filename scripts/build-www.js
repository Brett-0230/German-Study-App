// 把網頁檔案複製到 www/，給 Capacitor 打包成 iOS App
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const out = path.join(root, "www");
const files = ["index.html", "styles.css", "app.js", "manifest.json", "sw.js", "data", "icons"];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of files) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
console.log("www/ ready");
