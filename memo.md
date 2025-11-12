# レシートOCRアプリ 作業メモ

## 📌 プロジェクト情報

### GitHubリポジトリ
- **URL**: https://github.com/Yumiuse/receipt-ocr-app.git
- **提出用**: このURLを山﨑氏に送る

### プロジェクトのローカルパス
- **場所**: `/Users/yumikosawa/receipt-ocr-app`

---

## 🔑 APIキー（絶対に他人に見せない）

### Google Cloud Vision API
- **キー**: `AIzaSy...`（.envファイルに保存済み）
- **管理画面**: https://console.cloud.google.com/

### OpenAI API
- **キー**: `sk-...`（.envファイルに保存済み）
- **管理画面**: https://platform.openai.com/

### Google Apps Script (GAS)
- **URL**: `https://script.google.com/home/projects/14w8lxMZlysDBH0y4zCGPSWDBWsdEnWrmLJKPRa49Sk1uycfFLgA3nDNk/edit`（.envファイルに保存済み）
- **管理画面**: https://script.google.com/

---

## 📊 Google Spreadsheet
- **名前**: レシートOCRデータ
- **URL**: https://docs.google.com/spreadsheets/d/153YzguHRCzSP_JxRbadQfGnpVTj4x21mP7YvmNrC0zk/edit
- **用途**: 保存先データベース

---

## 🚀 次回の作業再開方法

### 1. プロジェクトを開く
```bash
cd /Users/yumikosawa/receipt-ocr-app
code .
```

### 2. アプリを起動
```bash
npm start
```

### 3. ブラウザで確認
http://localhost:3000

---

## 📋 よく使うコマンド

### アプリ起動
```bash
npm start
```

### アプリ停止
```
Control + C
```

### Gitの状態確認
```bash
git status
```

### GitHubにプッシュ
```bash
git add .
git commit -m "メッセージ"
git push
```

---

## 🔧 トラブル時の連絡先

### GAS編集画面
https://script.google.com/

### Spreadsheet
https://docs.google.com/spreadsheets/d/153YzguHRCzSP_JxRbadQfGnpVTj4x21mP7YvmNrC0zk/edit

### GitHub
https://github.com/Yumiuse/receipt-ocr-app.git

---

## 📅 提出情報

### 提出先
山﨑氏（Pfoloプログラミングスクール）

### 提出物
GitHubリポジトリURL: https://github.com/Yumiuse/receipt-ocr-app.git
### 提出期限
[記入]
```

5. **自分の情報に書き換える**
6. **保存（Command + S）**

---

### 重要：MEMO.mdはGitHubに含めない

**`.gitignore` に追加：**

1. **VS Codeで `.gitignore` を開く**
2. **最後に追加：**
```
# 個人メモ
MEMO.md