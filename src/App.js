import './App.css';
import { useState } from 'react';

// ★ 画像圧縮：Vision API を高速化（超重要）★
const compressImage = (file, maxSize = 1200) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = maxSize / Math.max(img.width, img.height);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // JPEGで圧縮率 0.8
      const compressedBase64 = canvas.toDataURL("image/jpeg", 0.8);
      resolve(compressedBase64);
    };

    img.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
};


// 脈動ドットのCSSアニメーション
const pulsingDotsStyle = `
.loading-dots {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
}
.loading-dots div {
  width: 10px;
  height: 10px;
  background: #3b82f6;
  border-radius: 50%;
  animation: pulse 1.5s infinite ease-in-out;
}
.loading-dots div:nth-child(1) { animation-delay: 0s; }
.loading-dots div:nth-child(2) { animation-delay: 0.3s; }
.loading-dots div:nth-child(3) { animation-delay: 0.6s; }
@keyframes pulse {
  0%, 100% { opacity: 0.6; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.3); }
}
`;

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

  // キャンセル用のAbortController（11/14追加）
  const [abortController, setAbortController] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // フィルタ用のState（11/14追加）
  const [filterStatus, setFilterStatus] = useState('all');

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

  // キャンセル処理関数（11/14追加）
  const handleCancelBatch = () => {
    if (abortController) {
      setIsCancelling(true);
      abortController.abort();
      showMessage('🛑 処理をキャンセル中...', 'warning');
    }
  };

  // ★★ 個別ファイル削除関数（11/14追加）★★
  const handleDeleteFile = (indexToDelete) => {
    if (!window.confirm(`${indexToDelete + 1}番目のファイルを削除しますか？`)) {
      return;
    }

    // 新しいfileQueueを作成（削除対象を除外）
    const newFileQueue = fileQueue.filter((_, idx) => idx !== indexToDelete);
    
    // 削除後のインデックスを再マッピング
    const newAllStructuredData = {};
    const newAllOcrTexts = {};
    const newProcessedFiles = [];
    
    // インデックスを再調整してデータをコピー
    let newIndex = 0;
    for (let oldIndex = 0; oldIndex < fileQueue.length; oldIndex++) {
      if (oldIndex === indexToDelete) continue; // 削除対象をスキップ
      
      if (allStructuredData[oldIndex]) {
        newAllStructuredData[newIndex] = allStructuredData[oldIndex];
      }
      if (allOcrTexts[oldIndex]) {
        newAllOcrTexts[newIndex] = allOcrTexts[oldIndex];
      }
      if (processedFiles.includes(oldIndex)) {
        newProcessedFiles.push(newIndex);
      }
      newIndex++;
    }
    
    // 状態を更新
    setFileQueue(newFileQueue);
    setAllStructuredData(newAllStructuredData);
    setAllOcrTexts(newAllOcrTexts);
    setProcessedFiles(newProcessedFiles);
    
    // 現在表示中のファイルを調整
    if (newFileQueue.length === 0) {
      // すべて削除された場合
      setCurrentFileIndex(0);
      setImage(null);
      setOcrText('');
      setStructuredData(null);
      setFileName('');
      setFileSize('');
      setIsEditing(false);
      setEditedData(null);
      showMessage('すべてのファイルが削除されました', 'info');
    } else if (currentFileIndex === indexToDelete) {
      // 表示中のファイルが削除された場合、最初のファイルを表示
      const newIndex = 0;
      setCurrentFileIndex(newIndex);
      
      const firstFile = newFileQueue[newIndex].file;
      setFileName(firstFile.name.length > 20 ? firstFile.name.substring(0, 17) + '...' : firstFile.name);
      setFileSize(formatFileSize(firstFile.size));
      
      const reader = new FileReader();
      reader.onload = (event) => setImage(event.target.result);
      reader.readAsDataURL(firstFile);
      
      if (newAllStructuredData[newIndex]) {
        setStructuredData(newAllStructuredData[newIndex]);
        setOcrText('構造化完了');
      } else {
        setOcrText('');
        setStructuredData(null);
      }
      setIsEditing(false);
      setEditedData(null);
      showMessage(`ファイルを削除しました（残り${newFileQueue.length}個）`, 'success');
    } else if (currentFileIndex > indexToDelete) {
      // 表示中のファイルより前のファイルが削除された場合、インデックスを-1
      setCurrentFileIndex(currentFileIndex - 1);
      showMessage(`ファイルを削除しました（残り${newFileQueue.length}個）`, 'success');
    } else {
      // 表示中のファイルより後ろのファイルが削除された場合、そのまま
      showMessage(`ファイルを削除しました（残り${newFileQueue.length}個）`, 'success');
    }
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
  
  // ★★ 既存のファイルがある場合は追加モード、ない場合は新規モード（11/14修正）★★
  const isAddMode = fileQueue.length > 0;
  
  if (!isAddMode) {
    // 新規モード：以前のデータを完全にクリア
    setAllStructuredData({});
    setAllOcrTexts({});
    setProcessedFiles([]);
    setIsEditing(false);
    setEditedData(null);
    setOcrText('');
    setStructuredData(null);
    setIsLoading(false);
  }
  
  // 複数ファイルの情報を準備（既存ファイル数を考慮してIDを生成）
  const baseIndex = isAddMode ? fileQueue.length : 0;
  const fileInfos = files.map((file, index) => ({
    id: Date.now() + baseIndex + index,
    file: file,
    name: file.name,
    status: '待機中',
    preview: URL.createObjectURL(file)
  }));
  
  if (isAddMode) {
    // ★★ 追加モード：既存のキューに新しいファイルを追加★★
    setFileQueue([...fileQueue, ...fileInfos]);
    showMessage(`${files.length}個のファイルを追加しました（合計${fileQueue.length + files.length}個）`, 'success');
  } else {
    // ★★ 新規モード：新しいキューを作成★★
    setFileQueue(fileInfos);
    setCurrentFileIndex(0);
    
    // 最初のファイルを表示
    const firstFile = files[0];
    setFileName(firstFile.name.length > 20 ? firstFile.name.substring(0, 17) + '...' : firstFile.name);
    setFileSize(formatFileSize(firstFile.size));
    
    // ★ 圧縮版の画像読み込み★
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const compressed = await compressImage(firstFile);
        setImage(compressed);
      } catch (e) {
        console.error("画像圧縮エラー:", e);
        setImage(event.target.result); // フォールバック
      }
    };
    reader.readAsDataURL(firstFile);
    
    alert(`${files.length}個のファイルが選択されました`);
  }
};

  const handleOCR = async () => {
    setIsLoading(true);
    setOcrText('処理中...');

    const apiKey = process.env.REACT_APP_VISION_API_KEY;
    const base64Image = image.split(',')[1];

    const requestBody = {
  requests: [
    {
      image: { content: base64Image },
      features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
      imageContext: { languageHints: ['ja'] }   // 日本語のOCR精度UP＋高速化
    }
  ]
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
      const ocrResult = data.responses[0].fullTextAnnotation?.text || '文字が検出されませんでした';
      setOcrText(ocrResult);
      showMessage('OCR読み取りが完了しました！', 'success');
      
      // 個別処理でもallOcrTextsを更新
      const updatedOcrTexts = {...allOcrTexts};
      updatedOcrTexts[currentFileIndex] = ocrResult;
      setAllOcrTexts(updatedOcrTexts);
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
    // ★★ ここに追加（OpenAIの処理高速化）★★
  const cleanedText = ocrText
    .replace(/\s{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  setIsLoading(true);
  setOcrText('OpenAIで構造化中...');

    setIsLoading(true);
    setOcrText('OpenAIで構造化中...');

    const apiKey = process.env.REACT_APP_OPENAI_API_KEY;

    const requestBody = {
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `以下のレシートから情報を抽出してJSON形式で返してください。

${cleanedText}

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
          
          // デバッグ: データ構造を確認
          console.log('📊 構造化されたデータ:', parsed);
          console.log('📋 現在のファイルインデックス:', currentFileIndex);
          
          // 個別処理でもallStructuredDataを更新
          const updatedAllData = {...allStructuredData};
          updatedAllData[currentFileIndex] = parsed;
          setAllStructuredData(updatedAllData);
          
          // デバッグ: 更新後のallStructuredDataを確認
          console.log('💾 更新後のallStructuredData:', updatedAllData);
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

    // 処理済みを追加
    const newProcessedFiles = [...processedFiles, currentFileIndex];
    setProcessedFiles(newProcessedFiles);

    // ★★ すべて完了しているかチェック（11/14修正）★★
    const allDone = fileQueue.every((_, idx) => newProcessedFiles.includes(idx));

    if (!allDone) {
      // ★★ 未処理のファイルを探す（11/14修正）★★
      const unprocessedIndex = fileQueue.findIndex((_, idx) => !newProcessedFiles.includes(idx));
      
      if (unprocessedIndex !== -1) {
        // 未処理ファイルへ移動
        setCurrentFileIndex(unprocessedIndex);

        const nextFile = fileQueue[unprocessedIndex].file;
        setFileName(
          nextFile.name.length > 20
            ? nextFile.name.substring(0, 17) + '...'
            : nextFile.name
        );
        setFileSize(formatFileSize(nextFile.size));

        const reader = new FileReader();
        reader.onload = (event) => setImage(event.target.result);
        reader.readAsDataURL(nextFile);

        if (allStructuredData[unprocessedIndex]) {
          setStructuredData(allStructuredData[unprocessedIndex]);
          setOcrText('構造化完了');
        } else {
          setOcrText('');
          setStructuredData(null);
        }
        
        showMessage(`📝 未処理のファイル（${unprocessedIndex + 1}/${fileQueue.length}）を表示しました`, 'info');
      }

    } else {
      // ★ 本当にすべてが完了したときだけここに来る
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


  // 一括処理関数（改良版：バッチ処理で高速化 + キャンセル機能）
const handleBatchProcess = async () => {
  if (fileQueue.length === 0) {
    alert('ファイルが選択されていません');
    return;
  }

  // AbortController を作成
  const controller = new AbortController();
  setAbortController(controller);
  setIsProcessingQueue(true);
  setIsCancelling(false);
  showMessage('🚀 並列処理を開始します...', 'success');
  
  const tempStructuredData = {};
  const tempOcrTexts = {};
  let processedCount = 0;

  try {
    // 全ファイルを一度に並列処理（バッチなし）
    const processingPromises = fileQueue.map(async (file, globalIndex) => {
      try {
        // キャンセルチェック
        if (controller.signal.aborted) {
          throw new Error('CANCELLED');
        }

        // 1. ファイル読み込み
        const base64Image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (controller.signal.aborted) {
              reject(new Error('CANCELLED'));
              return;
            }
            resolve(event.target.result.split(',')[1]);
          };
          reader.onerror = () => reject(new Error('File read error'));
          reader.readAsDataURL(file.file);
        });

        // 2. OCR実行
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
            }),
            signal: controller.signal
          }
        );

        if (controller.signal.aborted) {
          throw new Error('CANCELLED');
        }

        const ocrData = await ocrResponse.json();
        const ocrTextResult = ocrData.responses[0].fullTextAnnotation?.text || '文字が検出されませんでした';
        tempOcrTexts[globalIndex] = ocrTextResult;

        // 3. 構造化実行
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
            }),
            signal: controller.signal
          }
        );

        if (controller.signal.aborted) {
          throw new Error('CANCELLED');
        }

        const structureData = await structureResponse.json();
        const result = structureData.choices[0].message.content;
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          tempStructuredData[globalIndex] = JSON.parse(jsonMatch[0]);
        }

        processedCount++;
        
        // リアルタイム進捗更新
        setMessage({ 
          show: true, 
          text: `⚡ 並列処理: ${processedCount}/${fileQueue.length} (${Math.round((processedCount / fileQueue.length) * 100)}%)`, 
          type: 'success' 
        });

        return { success: true, index: globalIndex };

      } catch (error) {
        if (error.message === 'CANCELLED') {
          throw error;
        }
        
        console.error(`ファイル ${globalIndex + 1} の処理エラー:`, error);
        processedCount++;
        
        setMessage({ 
          show: true, 
          text: `❌ エラー: ${processedCount}/${fileQueue.length} (${Math.round((processedCount / fileQueue.length) * 100)}%)`, 
          type: 'warning' 
        });
        
        return { success: false, index: globalIndex, error };
      }
    });

    // 全ファイルの処理を並列実行
    await Promise.all(processingPromises);

    // 正常完了時の処理
    setAllStructuredData(tempStructuredData);
    setAllOcrTexts(tempOcrTexts);
    
    // 最初のファイルを表示
    if (tempStructuredData[0]) {
      setStructuredData(tempStructuredData[0]);
      setOcrText('構造化完了');
      
      const reader = new FileReader();
      reader.onload = (event) => setImage(event.target.result);
      reader.readAsDataURL(fileQueue[0].file);
    }

    const successCount = Object.keys(tempStructuredData).length;
    showMessage(`🎉 並列処理完了！${successCount}/${fileQueue.length}件を処理しました`, 'success');

  } catch (error) {
    if (error.message === 'CANCELLED') {
      showMessage(`🛑 処理をキャンセルしました（${processedCount}/${fileQueue.length}件が処理済み）`, 'warning');
      
      if (Object.keys(tempStructuredData).length > 0) {
        setAllStructuredData(tempStructuredData);
        setAllOcrTexts(tempOcrTexts);
        
        if (tempStructuredData[0]) {
          setStructuredData(tempStructuredData[0]);
          setOcrText('構造化完了');
          
          const reader = new FileReader();
          reader.onload = (event) => setImage(event.target.result);
          reader.readAsDataURL(fileQueue[0].file);
        }
      }
    } else {
      console.error('並列処理エラー:', error);
      showMessage('⚠️ 並列処理中にエラーが発生しました', 'error');
    }
  } finally {
    setIsProcessingQueue(false);
    setIsCancelling(false);
    setAbortController(null);
  }
};



  return (
    <div className="app-container">
      <style>{pulsingDotsStyle}</style>
      <h1>レシート OCR アプリ</h1>

      {message.show && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="main-layout">
  {/* ===== 左列：レシート一覧 ===== */}
  <div className="receipt-list-section">
    <div style={{
      background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
      color: '#495057',
      padding: '12px',
      borderBottom: '1px solid #dee2e6',
    }}>
      <h3 style={{ margin: '0', fontSize: '0.9rem' }}>
        📋 表示中: {fileQueue.length > 0 ? `${currentFileIndex + 1}/${fileQueue.length} ファイル` : '0件'}
      </h3>
    </div>

    {/* 画像選択ボタン */}
    <div style={{ padding: '10px' }}>
      <label 
        htmlFor="file-input" 
        className="btn btn-select"
        style={{ display: 'block', textAlign: 'center', width: '100%' }}
      >
        {fileQueue.length > 0 ? '画像を追加' : '画像選択'}
      </label>
      <input
        type="file"
        id="file-input"
        accept="image/*"
        onChange={handleChange}
        style={{ display: 'none' }}
        multiple
      />
      
      {/* リセットボタン（11/14追加） */}
      {fileQueue.length > 0 && (
        <button
          onClick={() => {
            if (window.confirm('すべてのファイルと処理データをクリアして、新しく始めますか？')) {
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
              setIsEditing(false);
              setEditedData(null);
              showMessage('すべてのデータをクリアしました', 'success');
            }
          }}
          style={{
            width: '100%',
            marginTop: '8px',
            padding: '10px',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)',
            transition: 'all 0.3s ease'
          }}
        >
          🗑️ すべてクリア
        </button>
      )}
    </div>

    {/* 全ファイル構造化ボタン */}
    {fileQueue.length > 0 && (
      <div style={{ padding: '0 10px 10px' }}>
        {!isProcessingQueue ? (
          <button
            onClick={handleBatchProcess}
            style={{
              width: '100%',
              padding: '16px 20px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '16px',
              fontSize: '14px',
              fontWeight: '600',
              letterSpacing: '0.025em',
              cursor: 'pointer',
              boxShadow: '0 8px 25px rgba(99, 102, 241, 0.3)',
              transition: 'all 0.3s ease',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
            }}
          >
            ⚡ 全ファイルを構造化
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <button
              style={{
                width: '100%',
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                fontSize: '14px',
                fontWeight: '600',
                letterSpacing: '0.025em',
                cursor: 'not-allowed',
                boxShadow: '0 4px 15px rgba(100, 116, 139, 0.2)',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
              }}
              disabled
            >
              {isCancelling ? '🛑 キャンセル中...' : '⏳ 処理中...'}
            </button>
            
            {!isCancelling && (
              <button
                onClick={handleCancelBatch}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: '600',
                  letterSpacing: '0.025em',
                  cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(220, 38, 38, 0.3)',
                  transition: 'all 0.3s ease',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
                }}
              >
                🛑 キャンセル
              </button>
            )}
          </div>
        )}
      </div>
    )}

    {/* フィルタ */}
    {fileQueue.length > 0 && (
  <div style={{ padding: '0 10px 10px' }}>
    <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>
      ステータスで絞り込み：
    </div>
    <div style={{ display: 'flex', gap: '5px' }}>
      <button
        onClick={() => setFilterStatus('all')}
        style={{
          flex: 1,
          padding: '5px',
          fontSize: '14px',
          border: 'none',
          borderRadius: '12px',
          background: filterStatus === 'all' ? '#667eea' : '#e0e0e0',
          color: filterStatus === 'all' ? 'white' : '#666',
          cursor: 'pointer'
        }}
      >
        全て
      </button>
      <button
        onClick={() => setFilterStatus('unprocessed')}
        style={{
          flex: 1,
          padding: '5px',
          fontSize: '13px',
          border: 'none',
          borderRadius: '12px',
          background: filterStatus === 'unprocessed' ? '#9E9E9E' : '#e0e0e0',
          color: filterStatus === 'unprocessed' ? 'white' : '#666',
          cursor: 'pointer'
        }}
      >
        未処理
      </button>
      <button
        onClick={() => setFilterStatus('draft')}
        style={{
          flex: 1,
          padding: '5px',
          fontSize: '13px',
          border: 'none',
          borderRadius: '12px',
          background: filterStatus === 'draft' ? '#FFC107' : '#e0e0e0',
          color: filterStatus === 'draft' ? 'white' : '#666',
          cursor: 'pointer'
        }}
      >
        AI下書き
      </button>
      <button
        onClick={() => setFilterStatus('confirmed')}
        style={{
          flex: 1,
          padding: '5px',
          fontSize: '13px',
          border: 'none',
          borderRadius: '12px',
          background: filterStatus === 'confirmed' ? '#4CAF50' : '#e0e0e0',
          color: filterStatus === 'confirmed' ? 'white' : '#666',
          cursor: 'pointer'
        }}
      >
        確定済
      </button>
    </div>
  </div>
)}

    {/* レシート一覧 */}
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '0 10px'
    }}>
      {fileQueue.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '30px',
          color: '#999'
        }}>
          <p style={{ fontSize: '12px' }}>レシート画像を<br/>選択してください</p>
        </div>
      ) : (
        fileQueue.map((file, index) => {
          // ステータス判定
          let status = 'unprocessed';
          if (processedFiles.includes(index)) {
            status = 'confirmed';
          } else if (allStructuredData[index]) {
            status = 'draft';
          }
          
          // フィルタ適用
          if (filterStatus !== 'all' && status !== filterStatus) {
            return null;
          }
          
          return (
            <div
              key={file.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                marginBottom: '6px',
                background: index === currentFileIndex 
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  : 'white',
                border: '1px solid',
                
                borderColor: index === currentFileIndex ? '#667eea' : '#e0e0e0',
                borderRadius: '8px',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              {/* 削除ボタン（11/14追加） */}
              <button
                onClick={(e) => {
                  e.stopPropagation(); // 親のonClickを発火させない
                  handleDeleteFile(index);
                }}
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  width: '24px',
                  height: '24px',
                  background: index === currentFileIndex ? 'rgba(255, 255, 255, 0.2)' : 'rgba(239, 68, 68, 0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  color: index === currentFileIndex ? 'white' : '#ef4444',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  zIndex: 10
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = index === currentFileIndex ? 'rgba(255, 255, 255, 0.3)' : 'rgba(239, 68, 68, 0.2)';
                  e.target.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = index === currentFileIndex ? 'rgba(255, 255, 255, 0.2)' : 'rgba(239, 68, 68, 0.1)';
                  e.target.style.transform = 'scale(1)';
                }}
                title="このファイルを削除"
              >
                ×
              </button>

              {/* クリック可能なエリア */}
              <div
                onClick={() => {
                  setCurrentFileIndex(index);
                  const selectedFile = fileQueue[index].file;
                  setFileName(selectedFile.name);
                  setFileSize(formatFileSize(selectedFile.size));
                  
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    setImage(event.target.result);
                    if (allStructuredData && allStructuredData[index]) {
                      setStructuredData(allStructuredData[index]);
                      setOcrText('構造化完了');
                    } else {
                      setOcrText('');
                      setStructuredData(null);
                    }
                  };
                  reader.readAsDataURL(selectedFile);
                  setIsEditing(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%'
                }}
              >
                {/* サムネイル */}
                <img
                  src={file.preview}
                  alt="サムネイル"
                  style={{
                    width: '60px',
                    height: '60px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    marginRight: '8px'
                  }}
                />
                
                {/* ファイル情報 */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '15px',
                    fontWeight: 'bold',
                    color: index === currentFileIndex ? 'white' : '#333'
                  }}>
                    {allStructuredData[index]?.店名 || file.name.substring(0, 10)}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: index === currentFileIndex ? '#f0f0f0' : '#666'
                  }}>
                    {allStructuredData[index]?.日付 || '---'}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: index === currentFileIndex ? '#f0f0f0' : '#666'
                  }}>
                    {allStructuredData[index] ? `¥${allStructuredData[index].合計金額?.toLocaleString() || '---'}` : ''}
                  </div>
                </div>
                
                {/* ステータステキスト */}
                <div style={{
                  fontSize: '15px',
                  color: index === currentFileIndex ? '#f0f0f0' : 
                         status === 'confirmed' ? '#4CAF50' : 
                         status === 'draft' ? '#FFC107' : '#9E9E9E',
                  fontWeight: 'bold',
                  marginRight: '8px'
                }}>
                  {status === 'confirmed' ? '✅確定済' : 
                   status === 'draft' ? '📝AI 下書き済' : 
                   '未処理'}
                </div>
              </div>
            </div>
          );
        }).filter(Boolean)
      )}
    </div>
  </div>

  {/* ===== 中央列：プレビュー ===== */}
<div className="center-section">
  <div style={{
    marginBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  }}>
    <span style={{ fontSize: '14px', color: '#666' }}>
      {fileName ? `ファイル: ${fileName}` : ''}
    </span>
    <span style={{ fontSize: '12px', color: '#999' }}>
      {fileSize || ''}
    </span>
  </div>
  
  <div style={{
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 20%, #ffecd2 100%)',
    borderRadius: '12px',
    cursor: image ? 'zoom-in' : 'default',
    overflow: 'hidden'
  }}
  onClick={() => image && setShowModal(true)}
  >
    {image && (
      <img
        src={image}
        alt="レシート"
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain'
        }}
      />
    )}
  </div>
</div>


  {/* ===== 右列：データと操作 ===== */}
  <div className="right-section">
    <div className="btn-group">
      <button
        className="btn btn-ocr"
        onClick={handleOCR}
        disabled={!image || isLoading}
        style={{
          padding: '16px 24px',
          background: !image || isLoading 
            ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
            : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '16px',
          fontSize: '14px',
          fontWeight: '600',
          letterSpacing: '0.025em',
          cursor: !image || isLoading ? 'not-allowed' : 'pointer',
          boxShadow: !image || isLoading 
            ? '0 4px 15px rgba(156, 163, 175, 0.2)'
            : '0 8px 25px rgba(16, 185, 129, 0.3)',
          transition: 'all 0.3s ease',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          width: '100%'
        }}
      >
        {isLoading && ocrText === '処理中...' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="loading-dots">
              <div></div>
              <div></div>
              <div></div>
            </div>
            📄 読み取り中...
          </div>
        ) : (
          'OCR実行'
        )}
      </button>

      <button
        className="btn btn-structure"
        onClick={handleStructure}
        disabled={!ocrText || isLoading || ocrText === '処理中...'}
        style={{
          padding: '16px 24px',
          background: !ocrText || isLoading || ocrText === '処理中...'
            ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
            : 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '16px',
          fontSize: '14px',
          fontWeight: '600',
          letterSpacing: '0.025em',
          cursor: !ocrText || isLoading || ocrText === '処理中...' ? 'not-allowed' : 'pointer',
          boxShadow: !ocrText || isLoading || ocrText === '処理中...'
            ? '0 4px 15px rgba(156, 163, 175, 0.2)'
            : '0 8px 25px rgba(14, 165, 233, 0.3)',
          transition: 'all 0.3s ease',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          width: '100%'
        }}
      >
        {isLoading && ocrText === 'OpenAIで構造化中...' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="loading-dots">
              <div></div>
              <div></div>
              <div></div>
            </div>
            🤖 AI解析中...
          </div>
        ) : (
          'AI解析'
        )}
      </button>

      <button
        className="btn btn-save"
        onClick={handleSave}
        disabled={!structuredData || isLoading}
        style={{
          padding: '16px 24px',
          background: !structuredData || isLoading
            ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
            : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '16px',
          fontSize: '14px',
          fontWeight: '600',
          letterSpacing: '0.025em',
          cursor: !structuredData || isLoading ? 'not-allowed' : 'pointer',
          boxShadow: !structuredData || isLoading
            ? '0 4px 15px rgba(156, 163, 175, 0.2)'
            : '0 8px 25px rgba(245, 158, 11, 0.3)',
          transition: 'all 0.3s ease',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          width: '100%'
        }}
      >
        {isLoading && structuredData ? (
          <><span className="loading-spinner"></span>保存中...</>
        ) : (
          '確定'
        )}
      </button>
    </div>

    {/* 次のレシートボタン（右列に移動） */}
    {fileQueue.length > 1 && structuredData && (
      <button
        onClick={() => {
          const nextIndex = (currentFileIndex + 1) % fileQueue.length;
          setCurrentFileIndex(nextIndex);
          
          const nextFile = fileQueue[nextIndex].file;
          setFileName(nextFile.name);
          setFileSize(formatFileSize(nextFile.size));
          
          const reader = new FileReader();
          reader.onload = (event) => {
            setImage(event.target.result);
            
            if (allStructuredData && allStructuredData[nextIndex]) {
              setStructuredData(allStructuredData[nextIndex]);
              setOcrText('構造化完了');
            } else {
              setOcrText('');
              setStructuredData(null);
            }
          };
          reader.readAsDataURL(nextFile);
          setIsEditing(false);
        }}
        style={{
          width: '100%',
          padding: '16px 24px',
          marginTop: '16px',
          background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '16px',
          fontSize: '14px',
          fontWeight: '600',
          letterSpacing: '0.025em',
          cursor: 'pointer',
          boxShadow: '0 8px 25px rgba(124, 58, 237, 0.3)',
          transition: 'all 0.3s ease',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
        }}
      >
        次のファイルへ →
      </button>
    )}

        
          

          

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
    
    // ★★ 現在のインデックスの構造化データを更新（11/14修正）★★
    const updatedAllData = {...allStructuredData};
    updatedAllData[currentFileIndex] = editedData;
    setAllStructuredData(updatedAllData);
    
    // ★★ 処理済みファイルに追加（11/14修正）★★
    const newProcessedFiles = [...processedFiles, currentFileIndex];
    setProcessedFiles(newProcessedFiles);
    
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
      
      // ★★ すべて完了しているかチェック（11/14修正）★★
      const allDone = fileQueue.every((_, idx) => newProcessedFiles.includes(idx));
      
      if (!allDone) {
        // ★★ 未処理のファイルを探す（11/14修正）★★
        const unprocessedIndex = fileQueue.findIndex((_, idx) => !newProcessedFiles.includes(idx));
        
        if (unprocessedIndex !== -1) {
          // 未処理ファイルへ移動
          setCurrentFileIndex(unprocessedIndex);
          
          const nextFile = fileQueue[unprocessedIndex].file;
          setFileName(nextFile.name.length > 20 ? nextFile.name.substring(0, 17) + '...' : nextFile.name);
          setFileSize(formatFileSize(nextFile.size));
          
          const reader = new FileReader();
          reader.onload = (event) => setImage(event.target.result);
          reader.readAsDataURL(nextFile);
          
          if (allStructuredData[unprocessedIndex]) {
            setStructuredData(allStructuredData[unprocessedIndex]);
            setOcrText('構造化完了');
          } else {
            setOcrText('');
            setStructuredData(null);
          }
          
          showMessage(`📝 未処理のファイル（${unprocessedIndex + 1}/${fileQueue.length}）を表示しました`, 'info');
        }
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