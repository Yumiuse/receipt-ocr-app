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
  // 複数ファイル対応用の State（11/13追加）
  const [fileQueue, setFileQueue] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [processedFiles, setProcessedFiles] = useState([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // 各ファイルの構造化データを保存（11/13修正）
  const [allStructuredData, setAllStructuredData] = useState({});
  const [allOcrTexts, setAllOcrTexts] = useState({});
  

  // 編集モード管理（11/13追加）
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState(null);

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
  const files = Array.from(e.target.files);  // ← 全てのファイルを配列で取得
  
  if (files.length === 0) return;
  
  // バリデーション：各ファイルをチェック
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
  const maxSize = 5 * 1024 * 1024;
  
  for (let file of files) {
    if (!validTypes.includes(file.type)) {
      alert(`${file.name} はサポートされていない形式です。JPG、PNG、GIF形式の画像を選択してください`);
      return;
    }
    if (file.size > maxSize) {
      alert(`${file.name} のファイルサイズが大きすぎます。5MB以下にしてください`);
      return;
    }
  }
  
  // 複数ファイルの情報を準備
  const fileInfos = files.map((file, index) => ({
    id: Date.now() + index,
    file: file,
    name: file.name,
    status: '待機中',
    preview: URL.createObjectURL(file)
  }));
  
  // キューに追加
  setFileQueue(fileInfos);
  setCurrentFileIndex(0);
  
  // 最初のファイルを表示
  const firstFile = files[0];
  setFileName(firstFile.name.length > 20 ? firstFile.name.substring(0, 17) + '...' : firstFile.name);
  setFileSize(formatFileSize(firstFile.size));
  
  const reader = new FileReader();
  reader.onload = (event) => setImage(event.target.result);
  reader.readAsDataURL(firstFile);
  
  // OCR結果をクリア
  setOcrText('');
  setStructuredData(null);
  setIsLoading(false);
  
  // メッセージ表示
  alert(`${files.length}個のファイルが選択されました`);
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
    showMessage(`${currentFileIndex + 1}番目のデータを保存しました！`, 'success');
    
    // 処理済みファイルを記録
    const newProcessedFiles = [...processedFiles, currentFileIndex];
    setProcessedFiles(newProcessedFiles);
    
    // 次のファイルへの遷移処理
    if (currentFileIndex < fileQueue.length - 1) {
      // 次のファイルへ自動遷移
      const nextIndex = currentFileIndex + 1;
      setCurrentFileIndex(nextIndex);
      
      const nextFile = fileQueue[nextIndex].file;
      setFileName(nextFile.name.length > 20 ? nextFile.name.substring(0, 17) + '...' : nextFile.name);
      setFileSize(formatFileSize(nextFile.size));
      
      const reader = new FileReader();
      reader.onload = (event) => setImage(event.target.result);
      reader.readAsDataURL(nextFile);
      
      if (allStructuredData[nextIndex]) {
        setStructuredData(allStructuredData[nextIndex]);
        setOcrText('構造化完了');
      } else {
        setOcrText('');
        setStructuredData(null);
      }
      
    } else {
      // 最後のファイルの場合
      showMessage('🎉 すべてのファイルの処理が完了しました！', 'success');
      
      setTimeout(() => {
        if (window.confirm('すべての処理が完了しました。新しいファイルを選択しますか？')) {
          // リセット
          setFileQueue([]);
          setCurrentFileIndex(0);
          setImage(null);
          setOcrText('');
          setStructuredData(null);
          setAllStructuredData({});
          setAllOcrTexts({});
          setProcessedFiles([]);
          setFileName('');
          setFileSize('');
        }
      }, 1000);
    }
    
  } catch (e) {
    console.error('[SAVE] fetch error:', e);
    alert('送信エラー: ' + e.message);
  } finally {
    setIsLoading(false);
  }
};

  // 一括処理関数（11/13追加）
  // 一括処理関数（11/13修正版 - Opus）
const handleBatchProcess = async () => {
  if (fileQueue.length === 0) {
    alert('ファイルが選択されていません');
    return;
  }

  setIsProcessingQueue(true);
  showMessage('高速処理を開始します...', 'success');
  
  const tempStructuredData = {};
  const tempOcrTexts = {};

  // 並列処理用のPromise配列
  const processingPromises = fileQueue.map(async (file, i) => {
    try {
      // ファイルを読み込み（並列）
      const base64Image = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve(event.target.result.split(',')[1]);
        };
        reader.readAsDataURL(file.file);
      });

      // OCR実行（並列）
      const apiKey = process.env.REACT_APP_VISION_API_KEY;
      const ocrResponse = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: base64Image },
              features: [{ type: 'TEXT_DETECTION' }]
            }]
          })
        }
      );

      const ocrData = await ocrResponse.json();
      const ocrTextResult = ocrData.responses[0].fullTextAnnotation?.text || '文字が検出されませんでした';
      tempOcrTexts[i] = ocrTextResult;

      // 構造化実行（並列）
      const openaiKey = process.env.REACT_APP_OPENAI_API_KEY;
      const structureResponse = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{
              role: "user",
              content: `以下のレシートから情報を抽出してJSON形式で返してください。

${ocrTextResult}

抽出項目：
- 店名：屋号や店舗のブランド名を優先（法人名や「株式会社」「有限会社」は除外）。例：「すしやまるいし」「ローソン」「スターバックス」
- 日付：YYYY年MM月DD日形式に統一（時間は除外）
- 合計金額：数字のみ（カンマや通貨記号なし）
- 消費税額：数字のみ（カンマや通貨記号なし）
- 品目：購入した商品名と数量を全てリスト化（形式：「商品名 × 数量」または「商品名（数量単位）」）
- 支払方法：現金、クレジット、QRコード決済など
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
          })
        }
      );

      const structureData = await structureResponse.json();
      const result = structureData.choices[0].message.content;
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        tempStructuredData[i] = JSON.parse(jsonMatch[0]);
      }

      // リアルタイム進捗更新
      setMessage({ 
        show: true, 
        text: `処理完了: ${Object.keys(tempStructuredData).length}/${fileQueue.length}`, 
        type: 'info' 
      });

      return { success: true, index: i };

    } catch (error) {
      console.error(`ファイル ${i + 1} の処理エラー:`, error);
      return { success: false, index: i, error };
    }
  });

  // すべての処理を並列実行
  const results = await Promise.all(processingPromises);
  
  // エラーチェック
  const errors = results.filter(r => !r.success);
  if (errors.length > 0) {
    showMessage(`${errors.length}件のエラーが発生しました`, 'warning');
  }

  // データを保存
  setAllStructuredData(tempStructuredData);
  setAllOcrTexts(tempOcrTexts);
  
  // 最初のファイルを表示
  if (tempStructuredData[0]) {
    setStructuredData(tempStructuredData[0]);
    setOcrText('構造化完了');
    
    // 最初の画像も表示
    const reader = new FileReader();
    reader.onload = (event) => setImage(event.target.result);
    reader.readAsDataURL(fileQueue[0].file);
  }

  setIsProcessingQueue(false);
  showMessage(`⚡ 高速処理完了！${fileQueue.length}件を処理しました`, 'success');
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
              multiple
            />
          </div>
          {/* 処理状況の表示（11/13追加） */}
          {/* 処理状況の表示と次のファイルボタン（11/13追加） */}
          {fileQueue.length > 0 && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px', alignItems: 'stretch' }}>
              <div style={{
                flex: 1,
                padding: '15px',
                background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.12) 0%, rgba(118, 75, 162, 0.12) 100%)',
border: '2px solid rgba(102, 126, 234, 0.3)',
                borderRadius: '12px',
                color: 'white',
                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)'
              }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#5E35B1' }}>
  📋 処理状況: {currentFileIndex + 1} / {fileQueue.length} ファイル
</h3>


                
                {/* 一括処理ボタン（11/13追加） */}
                <button
                  onClick={handleBatchProcess}
                  disabled={isProcessingQueue}
                  style={{
                    width: '50  %',
                    padding: '10px 20px',
                    marginBottom: '15px',
                    background: isProcessingQueue 
                             ? 'linear-gradient(135deg, #BDBDBD 0%, #9E9E9E 100%)'
                             : 'linear-gradient(135deg, #FF6B9D 0%, #FFA7C4 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.95rem',
                    fontWeight: 'bold',
                    cursor: isProcessingQueue ? 'not-allowed' : 'pointer',
                    boxShadow: '0 3px 12px rgba(255, 107, 157, 0.35)',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isProcessingQueue) {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 5px 15px rgba(76, 175, 80, 0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isProcessingQueue) {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 6px 18px rgba(255, 107, 157, 0.5)';
                    }
                  }}
                >
                  {isProcessingQueue ? '⏳ 処理中...' : ' 全ファイルを構造化'}
                </button>
                
                <div style={{




                
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                  marginTop: '10px'
                }}>
                  {fileQueue.map((file, index) => (
                    <div 
                      key={file.id} 
                      onClick={() => {
  // ファイル切り替え
  setCurrentFileIndex(index);
  const selectedFile = fileQueue[index].file;
  setFileName(selectedFile.name.length > 20 ? selectedFile.name.substring(0, 17) + '...' : selectedFile.name);
  setFileSize(formatFileSize(selectedFile.size));
  
  // 画像を表示
  const reader = new FileReader();
  reader.onload = (event) => setImage(event.target.result);
  reader.readAsDataURL(selectedFile);
  
  // 保存済みの構造化データがあれば表示
  if (allStructuredData[index]) {
    setStructuredData(allStructuredData[index]);
    setOcrText('構造化完了');
  } else if (allOcrTexts[index]) {
    setOcrText(allOcrTexts[index]);
    setStructuredData(null);
  } else {
    setOcrText('');
    setStructuredData(null);
  }
  
  // 編集モードをリセット
  setIsEditing(false);
  setEditedData(null);
}}
                      style={{
                        padding: '8px 12px',
                        background: index === currentFileIndex ? 'linear-gradient(135deg, #7C4DFF 0%, #B388FF 100%)' : 
           index < currentFileIndex ? 'linear-gradient(135deg, #B39DDB 0%, #D1C4E9 100%)' : 
           'rgba(124, 77, 255, 0.15)',
                        color: 'white',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: index === currentFileIndex ? 'bold' : 'normal',
                        border: index === currentFileIndex ? '2px solid #FFD700' : 'none',
boxShadow: index === currentFileIndex ? '0 4px 12px rgba(124, 77, 255, 0.4)' : 'none',
                        transition: 'all 0.3s ease',
                        cursor: 'pointer'
                      }}
                    >
                      {index + 1}. {file.name.substring(0, 12)}...
                    </div>
                  ))}
                </div>
              </div>
              
              
            </div>
          )}

                    {/* 次のファイルボタン（左側配置・11/13追加） */}
{fileQueue.length > 1 && (
  <button
    onClick={() => {
      const nextIndex = (currentFileIndex + 1) % fileQueue.length;
      setCurrentFileIndex(nextIndex);

      const nextFile = fileQueue[nextIndex].file;
      setFileName(nextFile.name.length > 20 ? nextFile.name.substring(0, 17) + '...' : nextFile.name);
      setFileSize(formatFileSize(nextFile.size));

      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target.result);
        
        // ⭐ 保存済みデータがあれば表示
        if (allStructuredData && allStructuredData[nextIndex]) {
          setStructuredData(allStructuredData[nextIndex]);
          setOcrText('構造化完了');
        } else if (allOcrTexts && allOcrTexts[nextIndex]) {
          setOcrText(allOcrTexts[nextIndex]);
          setStructuredData(null);
        } else {
          setOcrText('');
          setStructuredData(null);
        }
      };
      reader.readAsDataURL(nextFile);
      
      setIsEditing(false);
      setEditedData(null);
    }}
    style={{
      width: '100%',
      padding: '12px 20px',
      marginTop: '15px',
      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.8) 0%, rgba(118, 75, 162, 0.8) 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      fontSize: '1rem',
      fontWeight: 'bold',
      cursor: 'pointer',
      boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
      transition: 'all 0.3s ease',
    }}
    onMouseEnter={(e) => {
      e.target.style.transform = 'translateY(-2px)';
      e.target.style.boxShadow = '0 6px 20px rgba(255, 183, 77, 0.6)';
    }}
    onMouseLeave={(e) => {
      e.target.style.transform = 'translateY(0)';
      e.target.style.boxShadow = '0 4px 15px rgba(255, 183, 77, 0.3)';
    }}
  >
    {currentFileIndex === fileQueue.length - 1 ? '最初に戻る →' : '次のファイルへ →'}
  </button>
)}


          
          {/* 次のファイルボタン（コンパクト版・11/13追加） */}
          

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
          

          

          <div 
  className={`preview-area right-preview ${ocrText || structuredData ? 'has-content' : ''}`}
  style={{ marginTop: fileQueue.length > 0 ? ' 15px' : '0' }}
>
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
                overflowY: 'auto',
                position: 'relative'
              }}>
                {/* 編集ボタン（11/13追加） */}
                {!isEditing && (
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setEditedData({...structuredData});
                    }}
                    style={{
                      position: 'absolute',
                      top: '15px',
                      right: '15px',
                      padding: '8px 16px',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    ✏️ 編集
                  </button>
                )}

                {/* 表示モード */}
                {!isEditing && (
                  <>
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
                  </>
                )}

                {/* 編集モード */}
                {isEditing && editedData && (
                  <>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', color: '#5E35B1' }}>
                      📝 データを編集
                    </h3>

                    {/* 店名 */}
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#495057' }}>
                        店名:
                      </label>
                      <input
                        type="text"
                        value={editedData.店名 || ''}
                        onChange={(e) => setEditedData({...editedData, 店名: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '2px solid #e0e0e0',
                          borderRadius: '8px',
                          fontSize: '1rem',
                          transition: 'border-color 0.3s',
                          outline: 'none'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#667eea'}
                        onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                      />
                    </div>

                    {/* 日付 */}
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#495057' }}>
                        日付:
                      </label>
                      <input
                        type="text"
                        value={editedData.日付 || ''}
                        onChange={(e) => setEditedData({...editedData, 日付: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '2px solid #e0e0e0',
                          borderRadius: '8px',
                          fontSize: '1rem',
                          transition: 'border-color 0.3s',
                          outline: 'none'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#667eea'}
                        onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                      />
                    </div>

                    {/* 合計金額 */}
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#495057' }}>
                        合計金額:
                      </label>
                      <input
                        type="number"
                        value={editedData.合計金額 || ''}
                        onChange={(e) => setEditedData({...editedData, 合計金額: parseInt(e.target.value) || 0})}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '2px solid #e0e0e0',
                          borderRadius: '8px',
                          fontSize: '1rem',
                          transition: 'border-color 0.3s',
                          outline: 'none'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#667eea'}
                        onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                      />
                    </div>

                    {/* 消費税額 */}
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#495057' }}>
                        消費税額:
                      </label>
                      <input
                        type="number"
                        value={editedData.消費税額 || ''}
                        onChange={(e) => setEditedData({...editedData, 消費税額: parseInt(e.target.value) || 0})}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '2px solid #e0e0e0',
                          borderRadius: '8px',
                          fontSize: '1rem',
                          transition: 'border-color 0.3s',
                          outline: 'none'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#667eea'}
                        onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                      />
                    </div>

                    {/* 支払方法 */}
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#495057' }}>
                        支払方法:
                      </label>
                      <input
                        type="text"
                        value={editedData.支払方法 || ''}
                        onChange={(e) => setEditedData({...editedData, 支払方法: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '2px solid #e0e0e0',
                          borderRadius: '8px',
                          fontSize: '1rem',
                          transition: 'border-color 0.3s',
                          outline: 'none'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#667eea'}
                        onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
                      />
                    </div>

                    {/* 品目 - 追加！ */}
<div style={{ marginBottom: '15px' }}>
  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#495057' }}>
    品目:
  </label>
  <textarea
    value={editedData.品目 ? 
      (typeof editedData.品目 === 'string' ? 
        editedData.品目 : 
        editedData.品目.join('\n')) : ''}
    onChange={(e) => setEditedData({
      ...editedData, 
      品目: e.target.value.split('\n').filter(item => item.trim())
    })}
    style={{
      width: '100%',
      padding: '10px',
      border: '2px solid #e0e0e0',
      borderRadius: '8px',
      fontSize: '1rem',
      minHeight: '80px',
      transition: 'border-color 0.3s',
      outline: 'none',
      resize: 'vertical'
    }}
    onFocus={(e) => e.target.style.borderColor = '#667eea'}
    onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
    placeholder="例：商品名1&#10;商品名2"
  />
</div>

{/* 勘定科目提案 - 追加！ */}
<div style={{ marginBottom: '20px' }}>
  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#495057' }}>
    勘定科目提案:
  </label>
  <textarea
    value={editedData.勘定科目提案 ? 
      (typeof editedData.勘定科目提案 === 'string' ? 
        editedData.勘定科目提案 : 
        editedData.勘定科目提案.join('\n')) : ''}
    onChange={(e) => setEditedData({
      ...editedData, 
      勘定科目提案: e.target.value.split('\n').filter(item => item.trim())
    })}
    style={{
      width: '100%',
      padding: '10px',
      border: '2px solid #e0e0e0',
      borderRadius: '8px',
      fontSize: '1rem',
      minHeight: '60px',
      transition: 'border-color 0.3s',
      outline: 'none',
      resize: 'vertical'
    }}
    onFocus={(e) => e.target.style.borderColor = '#667eea'}
    onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
    placeholder="例：文房具費&#10;消耗品費&#10;雑費"
  />
</div>

                    {/* ボタン */}
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                      <button
  onClick={async () => {
    // 編集データを反映
    setStructuredData(editedData);
    setIsEditing(false);
    
    // 現在のインデックスの構造化データを更新
    const updatedAllData = {...allStructuredData};
    updatedAllData[currentFileIndex] = editedData;
    setAllStructuredData(updatedAllData);
    
    // Spreadsheetに保存
    const gasUrl = process.env.REACT_APP_GAS_URL;
    const fd = new FormData();
    fd.append('payload', JSON.stringify(editedData));
    
    try {
      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: fd
      });
      showMessage(`${currentFileIndex + 1}番目のデータを保存しました！`, 'success');
      
      // 処理済みファイルを記録
      const newProcessedFiles = [...processedFiles, currentFileIndex];
      setProcessedFiles(newProcessedFiles);
      
      // 次のファイルがあるか確認
      if (currentFileIndex < fileQueue.length - 1) {
        // 次のファイルへ自動遷移
        const nextIndex = currentFileIndex + 1;
        setCurrentFileIndex(nextIndex);
        
        // 次のファイルの情報を設定
        const nextFile = fileQueue[nextIndex].file;
        setFileName(nextFile.name.length > 20 ? nextFile.name.substring(0, 17) + '...' : nextFile.name);
        setFileSize(formatFileSize(nextFile.size));
        
        // 次のファイルの画像を表示
        const reader = new FileReader();
        reader.onload = (event) => setImage(event.target.result);
        reader.readAsDataURL(nextFile);
        
        // 次のファイルの構造化データを表示
        if (allStructuredData[nextIndex]) {
          setStructuredData(allStructuredData[nextIndex]);
          setOcrText('構造化完了');
        } else {
          setOcrText('');
          setStructuredData(null);
        }
        
        showMessage(`次のファイル（${nextIndex + 1}/${fileQueue.length}）に移動しました`, 'info');
        
      } else {
        // 最後のファイルの場合
        showMessage('🎉 すべてのファイルの処理が完了しました！', 'success');
        
        // 完了ダイアログ
        setTimeout(() => {
          if (window.confirm('すべての処理が完了しました。新しいファイルを選択しますか？')) {
            // 全体をリセット
            setFileQueue([]);
            setCurrentFileIndex(0);
            setImage(null);
            setOcrText('');
            setStructuredData(null);
            setAllStructuredData({});
            setAllOcrTexts({});
            setProcessedFiles([]);
            setFileName('');
            setFileSize('');
            setEditedData(null);
          }
        }, 1000);
      }
      
    } catch (e) {
      console.error('保存エラー:', e);
      showMessage('保存に失敗しました', 'error');
    }
  }}
  style={{
    flex: 1,
    padding: '12px 20px',
    background: 'linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 3px 10px rgba(76, 175, 80, 0.3)',
    transition: 'all 0.3s ease'
  }}
>
  💾 保存して確定
</button>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setEditedData(null);
                        }}
                        style={{
                          flex: 1,
                          padding: '12px 20px',
                          background: 'linear-gradient(135deg, #9E9E9E 0%, #757575 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '1rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          boxShadow: '0 3px 10px rgba(158, 158, 158, 0.3)',
                          transition: 'all 0.3s ease'
                        }}
                      >
                        ❌ キャンセル
                      </button>
                    </div>
                  </>
                )}
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