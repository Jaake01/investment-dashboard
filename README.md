# 投資儀表板 Investment Dashboard

一個純前端（React + Vite + TypeScript）的投資組合儀表板，部署在 GitHub Pages。所有資料都存在瀏覽器 localStorage，沒有後端伺服器。

## 功能

- 持股清單與損益總覽（市值、成本、損益金額與百分比）
- 資產配置圖表（依持股或依資產類別）
- 新增／編輯／刪除持股
- 歷史趨勢圖（每次刷新報價會記錄一筆每日總市值快照）

## 資料來源

三種來源可同時使用，彼此不衝突：

1. **手動輸入**：透過表單新增/編輯持股（股數、平均成本、資產類別）。
2. **Google Sheet 匯入**：在 Google Sheet 用「檔案 → 共用 → 發布到網路」發布為 CSV，把產生的網址貼到「設定」面板匯入。CSV 需要 `symbol`、`shares`、`avgCost` 欄位，`assetClass`、`name` 選填。匯入時可選擇「依代號合併」或「整批覆蓋」。
3. **即時報價 API**：在「設定」面板選擇 Finnhub 或 Twelve Data，填入你自己申請的免費 API key，點「立即刷新報價」。API key 只存在瀏覽器 localStorage。

## 本地開發

```bash
npm install
npm run dev
```

## 建置

```bash
npm run build
```

## 部署到 GitHub Pages

本專案已經設定 `.github/workflows/deploy.yml`，push 到 `main` 分支會自動建置並部署。

**第一次部署前，需要手動到 GitHub repo 設定一次：** Settings → Pages → Source 選擇「GitHub Actions」（新 repo 預設是「Deploy from a branch」）。

部署完成後可在 `https://<你的帳號>.github.io/investment-dashboard/` 看到網站。
