# レシートOCRアプリ

レシート画像から情報を自動抽出し、Google Spreadsheetに保存する経理精算アプリです。

![アプリスクリーンショット](screenshot.png)

## 機能

- 📷 **画像アップロード**: レシート画像を選択
- 🔍 **OCR処理**: Google Cloud Vision APIで文字認識
- 🤖 **AI構造化**: OpenAI GPT-4o-miniでデータ抽出
- 💾 **自動保存**: Google Spreadsheetに自動記録
- ✨ **UI改善**: ローディング表示、画像拡大、エラーハンドリング

## 抽出データ

- 店名
- 日付
- 合計金額
- 消費税額
- 品目・数量
- 支払方法
- 勘定科目提案（3つ）

## 技術スタック

- **フロントエンド**: React.js
- **OCR**: Google Cloud Vision API
- **AI**: OpenAI API (GPT-4o-mini)
- **データ保存**: Google Apps Script + Google Spreadsheet
- **スタイル**: CSS3（グラデーション、アニメーション）

## セットアップ

### 必要なもの

- Node.js (v14以上)
- Google Cloud Vision APIキー
- OpenAI APIキー
- Google Apps Scriptのデプロイ済みURL

### インストール
```bash
# リポジトリをクローン
git clone [your-repo-url]

# ディレクトリに移動
cd receipt-ocr-app

# 依存関係をインストール
npm install
```

### 環境変数の設定

`.env`ファイルを作成：
```
REACT_APP_VISION_API_KEY=your_google_vision_api_key
REACT_APP_OPENAI_API_KEY=your_openai_api_key
REACT_APP_GAS_URL=your_gas_deploy_url
```

### 起動
```bash
npm start
```

ブラウザで `http://localhost:3000` を開く

## 使い方

1. **画像選択**: 「画像選択」ボタンをクリックしてレシート画像を選択
2. **OCR実行**: 「OCR実行」ボタンで文字認識
3. **構造化**: 「構造化」ボタンでデータを整理
4. **保存**: 「保存」ボタンでSpreadsheetに記録

## Google Apps Script設定

1. Google Spreadsheetを作成
2. 拡張機能 → Apps Script
3. `コード.gs`に以下をコピー：

[GASコードへのリンクまたは説明]

4. デプロイ → ウェブアプリ → 「全員（匿名を含む）」
5. URLを`.env`に設定

## 工夫した点

- **OCR誤認識の修正**: AIが「血」→「皿」など自動修正
- **店名抽出の改善**: 法人格を除外して屋号のみ抽出
- **UI/UX**: 左右2カラムレイアウト、ローディング表示、画像拡大機能
- **エラーハンドリング**: ファイル形式・サイズチェック、API エラーの分かりやすいメッセージ

## 今後の改善案

- PDF対応
- 複数画像の一括処理
- 月次レポート生成
- データのCSV出力

## ライセンス

MIT

## 作成者

[Yumiko Sawa]