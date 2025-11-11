import './App.css';
import { useState } from 'react';

function App() {
  const [image, setImage] = useState(null);
  const [ocrText, setOcrText] = useState('');
  const [structuredData, setStructuredData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState({ show: false, text: '', type: '' });

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const showMessage = (text, type) => {
    setMessage({ show: true, text, type });
    setTimeout(() => {
      setMessage({ show: false, text: '', type: '' });
    }, 3000);
  };

  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        alert('JPG、PNG、GIF形式の画像を選択してください');
        return;
      }

      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        alert('ファイルサイズは5MB以下にしてください');
        return;
      }

      setOcrText('');
      setStructuredData(null);
      setIsLoading(false);

      setFileName(file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name);
      setFileSize(formatFileSize(file.size));

      const reader = new FileReader();
      reader.onload = (event) => setImage(event.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleOCR = async () => {
    setIsLoading(true);
    setOcrText('処理中...');

    const apiKey = process.env.REACT_APP_VISION_API_KEY;
    const base64Image = image.split(',')[1];

    const requestBody = {
      requests: [{
        image: { content: base64Image },
        features: [{ type: 'TEXT_DETECTION' }]
      }]
    };

    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        }
      );

      const data = await response.json();
      const text = data.responses[0].fullTextAnnotation?.text || '文字が検出されませんでした';
      setOcrText(text);
      showMessage('OCR読み取りが完了しました！', 'success');
    } catch (error) {
      console.error('OCR error:', error);
      if (error.message.includes('Failed to fetch')) {
        setOcrText('ネットワークエラー：インターネット接続を確認してください');
      } else if (error.message.includes('API key')) {
        setOcrText('APIキーエラー：設定を確認してください');
      } else {
        setOcrText('OCRエラーが発生しました：' + error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStructure = async () => {
    if (!ocrText || ocrText === '処理中...' || ocrText === 'OpenAIで構造化中...') {
      alert('まずOCR実行をしてください');
      return;
    }

    setIsLoading(true);
    setOcrText('OpenAIで構造化中...');

    const apiKey = process.env.REACT_APP_OPENAI_API_KEY;

    const requestBody = {
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `以下のレシートから情報を抽出してJSON形式で返してください。

${ocrText}

抽出項目：
- 店名：屋号や店舗のブランド名を優先（法人名や「株式会社」「有限会社」は除外）。例：「すしやまるいし」「ローソン」「スターバックス」
- 日付：YYYY年MM月DD日形式に統一（時間は除外）
- 合計金額：数字のみ（カンマや通貨記号なし）
- 消費税額：数字のみ（カンマや通貨記号なし）
- 品目：購入した商品名と数量を全てリスト化（形式：「商品名 × 数量」または「商品名（数量単位）」）- 支払方法：現金、クレジット、QRコード決済など
- 勘定科目提案：この取引に適した勘定科目を3つ提案

重要な指示：
1. 店名は屋号や店舗のブランド名のみを記載してください
   - 良い例：「すしやまるいし」「ローソン」「マルイ」
   - 悪い例：「有限会社石原商店 すしやまるいし」「株式会社ローソン」
   - 法人格（株式会社、有限会社など）は除外してください

2. OCRの誤認識を修正してください
   - 「血」→「皿」（飲食店で「190円血」は「190円皿」の誤認識）
   - 「畑」→「欄」
   - その他明らかな誤字を修正

3. 品目は商品名と数量を含めてください
   - フォーマット：「商品名 × 数量」または「商品名（数量単位）」
   - 良い例：「まぐろ × 3皿」「寿司（190円）× 3皿」
   - 数量が不明な場合は「商品名」のみでOK
   - 価格は（ ）内に含めても良い
   
4. 日付は必ず「YYYY年MM月DD日」形式に統一してください（時間は含めない）

5. 飲食店の場合、メニュー名を品目として記載してください

形式：
{
  "店名": "屋号のみ",
  "日付": "YYYY年MM月DD日",
  "合計金額": 数字,
  "消費税額": 数字,
  "品目": ["商品名1", "商品名2", ...],
  "支払方法": "...",
  "勘定科目提案": ["科目1", "科目2", "科目3"]
}`
      }],
      temperature: 0
    };

    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        }
      );

      const data = await response.json();
      const result = data.choices[0].message.content;

      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setStructuredData(parsed);
          setOcrText('構造化完了');
          showMessage('データの構造化が完了しました！', 'success');
        }
      } catch (e) {
        setOcrText(result);
      }
    } catch (error) {
      console.error('OpenAI error:', error);
      if (error.message.includes('Failed to fetch')) {
        setOcrText('ネットワークエラー：インターネット接続を確認してください');
      } else if (error.message.includes('401')) {
        setOcrText('OpenAI APIキーエラー：設定を確認してください');
      } else if (error.message.includes('429')) {
        setOcrText('API利用制限エラー：しばらく待ってから再試行してください');
      } else {
        setOcrText('OpenAIエラー：' + error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!structuredData) {
      alert('保存するデータがありません');
      return;
    }

    setIsLoading(true);

    const gasUrl = process.env.REACT_APP_GAS_URL;
    const fd = new FormData();
    fd.append('payload', JSON.stringify(structuredData));

    try {
      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: fd
      });
      showMessage('データを保存しました！', 'success');
    } catch (e) {
      console.error('[SAVE] fetch error:', e);
      alert('送信エラー: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <h1>レシート OCR アプリ</h1>

      {message.show && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="main-layout">
        <div className="left-section">
          <div className="button-container">
            <label htmlFor="file-input" className="btn btn-select">
              画像選択
            </label>
            <input
              type="file"
              id="file-input"
              accept="image/*"
              onChange={handleChange}
              style={{ display: 'none' }}
            />
          </div>

          <div className={`preview-area left-preview ${image ? 'has-content' : ''}`}>
            {fileName && (
              <div className="file-info" style={{ display: 'block' }}>
                <p><strong>ファイル:</strong> {fileName}</p>
                <p><strong>サイズ:</strong> {fileSize}</p>
              </div>
            )}

            {!image && (
              <div className="preview-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <p>レシート画像を選択</p>
              </div>
            )}

            {image && (
              <img
                src={image}
                alt="レシート画像"
                style={{ 
                  maxWidth: 'calc(100% - 20px)',
                  maxHeight: 'calc(100% - 20px)',
                  width: 'auto',
                  height: 'auto',
                  borderRadius: '12px',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
                  objectFit: 'contain',
                  cursor: 'zoom-in'
                }}
                onClick={() => setShowModal(true)}
              />
            )}
          </div>
        </div>

        <div className="right-section">
          <div className="btn-group">
            <button
              className="btn btn-ocr"
              onClick={handleOCR}
              disabled={!image || isLoading}
            >
              {isLoading && !structuredData ? (
                <><span className="loading-spinner"></span>読み取り中...</>
              ) : (
                'OCR実行'
              )}
            </button>

            <button
              className="btn btn-structure"
              onClick={handleStructure}
              disabled={!ocrText || isLoading || ocrText === '処理中...'}
            >
              {isLoading && ocrText === 'OpenAIで構造化中...' ? (
                <><span className="loading-spinner"></span>構造化中...</>
              ) : (
                '構造化'
              )}
            </button>

            <button
              className="btn btn-save"
              onClick={handleSave}
              disabled={!structuredData || isLoading}
            >
              {isLoading && structuredData ? (
                <><span className="loading-spinner"></span>保存中...</>
              ) : (
                '保存'
              )}
            </button>
          </div>

          <div className={`preview-area right-preview ${ocrText || structuredData ? 'has-content' : ''}`}>
            {!ocrText && !structuredData && (
              <div className="preview-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <p>構造化データがここに表示されます</p>
              </div>
            )}

            {ocrText && !structuredData && (
              <div style={{
                width: '100%',
                height: '100%',
                padding: '15px',
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 5px 20px rgba(0, 0, 0, 0.1)',
                fontFamily: "'Courier New', monospace",
                fontSize: '0.9rem',
                lineHeight: '1.5',
                overflowY: 'auto'
              }}>
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{ocrText}</pre>
              </div>
            )}

            {structuredData && (
              <div style={{
                width: '100%',
                height: '100%',
                padding: '15px',
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 5px 20px rgba(0, 0, 0, 0.1)',
                overflowY: 'auto'
              }}>
                <div className="result-item">
                  <span className="result-label">店名:</span>
                  <span className="result-value">{structuredData.店名}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">日付:</span>
                  <span className="result-value">{structuredData.日付}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">合計金額:</span>
                  <span className="result-value">¥{structuredData.合計金額?.toLocaleString()}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">消費税額:</span>
                  <span className="result-value">¥{structuredData.消費税額?.toLocaleString()}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">品目:</span>
                  <div style={{ marginTop: '8px' }}>
                    {structuredData.品目?.map((item, i) => (
                      <div key={i} style={{ padding: '4px 0' }}>・{item}</div>
                    ))}
                  </div>
                </div>
                <div className="result-item">
                  <span className="result-label">支払方法:</span>
                  <span className="result-value">{structuredData.支払方法}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">勘定科目提案:</span>
                  <div style={{ marginTop: '8px' }}>
                    {structuredData.勘定科目提案?.map((item, i) => (
                      <div key={i} style={{ padding: '4px 0' }}>{i + 1}. {item}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <div
          className="image-modal"
          style={{ display: 'block' }}
          onClick={() => setShowModal(false)}
        >
          <img src={image} alt="拡大画像" />
        </div>
      )}
    </div>
  );
}

export default App;