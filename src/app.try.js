import './App.css';
import React, { useState, useRef, useEffect, useCallback } from 'react';

// ★ 画像圧縮：最適化してより高速に
const compressImage = (file, maxSize = 800) => {
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

      // JPEGで圧縮率 0.6（高速化）
      const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
      resolve(compressedBase64);
    };

    img.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
};

// ★ 画像回転関数（新規追加）
const rotateImage = (imageSrc, rotation) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      // 回転角度に応じてキャンバスサイズを調整
      if (rotation % 180 === 90) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      
      // 中心点を軸に回転
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = imageSrc;
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
  const [fileQueue, setFileQueue] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [processedFiles, setProcessedFiles] = useState([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [allStructuredData, setAllStructuredData] = useState({});
  const [allOcrTexts, setAllOcrTexts] = useState({});
  const [allOcrElements, setAllOcrElements] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState(null);
  const [abortController, setAbortController] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [ocrElements, setOcrElements] = useState([]);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [highlightedItem, setHighlightedItem] = useState(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  
  // ★ 画像回転用のState（新規追加）
  const [imageRotation, setImageRotation] = useState(0);

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

  const handleCancelBatch = () => {
    if (abortController) {
      setIsCancelling(true);
      abortController.abort();
      showMessage('🛑 処理をキャンセル中...', 'warning');
    }
  };

  const handleDeleteFile = (indexToDelete) => {
    if (!window.confirm(`${indexToDelete + 1}番目のファイルを削除しますか？`)) {
      return;
    }

    const newFileQueue = fileQueue.filter((_, idx) => idx !== indexToDelete);
    const newAllStructuredData = {};
    const newAllOcrTexts = {};
    const newAllOcrElements = {};
    const newProcessedFiles = [];
    
    let newIndex = 0;
    for (let oldIndex = 0; oldIndex < fileQueue.length; oldIndex++) {
      if (oldIndex === indexToDelete) continue;
      
      if (allStructuredData[oldIndex]) {
        newAllStructuredData[newIndex] = allStructuredData[oldIndex];
      }
      if (allOcrTexts[oldIndex]) {
        newAllOcrTexts[newIndex] = allOcrTexts[oldIndex];
      }
      if (allOcrElements[oldIndex]) {
        newAllOcrElements[newIndex] = allOcrElements[oldIndex];
      }
      if (processedFiles.includes(oldIndex)) {
        newProcessedFiles.push(newIndex);
      }
      newIndex++;
    }
    
    setFileQueue(newFileQueue);
    setAllStructuredData(newAllStructuredData);
    setAllOcrTexts(newAllOcrTexts);
    setAllOcrElements(newAllOcrElements);
    setProcessedFiles(newProcessedFiles);
    
    if (newFileQueue.length === 0) {
      setCurrentFileIndex(0);
      setImage(null);
      setOcrText('');
      setStructuredData(null);
      setOcrElements([]);
      setFileName('');
      setFileSize('');
      setIsEditing(false);
      setEditedData(null);
      setImageRotation(0);
      showMessage('すべてのファイルが削除されました', 'info');
    } else if (currentFileIndex === indexToDelete) {
      const newIndex = 0;
      setCurrentFileIndex(newIndex);
      
      const firstFile = newFileQueue[newIndex].file;
      setFileName(firstFile.name.length > 20 ? firstFile.name.substring(0, 17) + '...' : firstFile.name);
      setFileSize(formatFileSize(firstFile.size));
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        const compressed = await compressImage(firstFile);
        setImage(compressed);
      };
      reader.readAsDataURL(firstFile);
      
      if (newAllStructuredData[newIndex]) {
        setStructuredData(newAllStructuredData[newIndex]);
        setOcrElements(newAllOcrElements[newIndex] || []);
        setOcrText('構造化完了');
      } else {
        setOcrText('');
        setStructuredData(null);
        setOcrElements([]);
      }
      setIsEditing(false);
      setEditedData(null);
      setImageRotation(0);
      showMessage(`ファイルを削除しました（残り${newFileQueue.length}個）`, 'success');
    } else if (currentFileIndex > indexToDelete) {
      setCurrentFileIndex(currentFileIndex - 1);
      showMessage(`ファイルを削除しました（残り${newFileQueue.length}個）`, 'success');
    } else {
      showMessage(`ファイルを削除しました（残り${newFileQueue.length}個）`, 'success');
    }
  };

  // ★ 画像回転ハンドラ（新規追加）
  const handleRotateImage = async () => {
    if (!image) return;
    
    const newRotation = (imageRotation + 90) % 360;
    setImageRotation(newRotation);
    
    // 画像を回転
    const rotatedImage = await rotateImage(image, 90);
    setImage(rotatedImage);
    
    showMessage(`🔄 画像を${newRotation}度回転しました`, 'info');
  };

  const handleChange = async (e) => {
    const files = Array.from(e.target.files);
    
    if (files.length === 0) return;
    
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
    
    const isAddMode = fileQueue.length > 0;
    
    if (!isAddMode) {
      setAllStructuredData({});
      setAllOcrTexts({});
      setAllOcrElements({});
      setProcessedFiles([]);
      setIsEditing(false);
      setEditedData(null);
      setOcrText('');
      setStructuredData(null);
      setOcrElements([]);
      setIsLoading(false);
      setImageRotation(0);
    }
    
    const baseIndex = isAddMode ? fileQueue.length : 0;
    const fileInfos = files.map((file, index) => ({
      id: Date.now() + baseIndex + index,
      file: file,
      name: file.name,
      status: '待機中',
      preview: URL.createObjectURL(file)
    }));
    
    if (isAddMode) {
      setFileQueue([...fileQueue, ...fileInfos]);
      showMessage(`${files.length}個のファイルを追加しました（合計${fileQueue.length + files.length}個）`, 'success');
    } else {
      setFileQueue(fileInfos);
      setCurrentFileIndex(0);
      
      const firstFile = files[0];
      setFileName(firstFile.name.length > 20 ? firstFile.name.substring(0, 17) + '...' : firstFile.name);
      setFileSize(formatFileSize(firstFile.size));
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const compressed = await compressImage(firstFile);
          setImage(compressed);
        } catch (e) {
          console.error("画像圧縮エラー:", e);
          setImage(event.target.result);
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
          features: [
            { type: 'DOCUMENT_TEXT_DETECTION' }
          ],
          imageContext: { languageHints: ['ja'] }
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
      const textAnnotations = data.responses[0].textAnnotations || [];
      
      const ocrElementsWithId = textAnnotations.slice(1).map((annotation, index) => ({
        id: index,
        description: annotation.description,
        boundingPoly: annotation.boundingPoly
      }));
      
      const fullText = textAnnotations[0]?.description || '文字が検出されませんでした';
      
      setOcrText(fullText);
      setOcrElements(ocrElementsWithId);
      
      const updatedOcrTexts = {...allOcrTexts};
      updatedOcrTexts[currentFileIndex] = fullText;
      setAllOcrTexts(updatedOcrTexts);
      
      const updatedOcrElements = {...allOcrElements};
      updatedOcrElements[currentFileIndex] = ocrElementsWithId;
      setAllOcrElements(updatedOcrElements);

      showMessage('OCR読み取りが完了しました！', 'success');
      
    } catch (error) {
      console.error('OCR error:', error);
      setOcrText('OCRエラーが発生しました：' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const reconstructBoundingPolys = (aiResultWithIds, ocrElements) => {
    console.log('📐 座標再構成開始');
    console.log('AI結果:', aiResultWithIds);
    console.log('OCR要素数:', ocrElements.length);
    
    const finalResult = {};
    
    const ocrElementMap = new Map(
      ocrElements.map(el => [el.id, el])
    );
    
    for (const itemName in aiResultWithIds) {
      if (aiResultWithIds.hasOwnProperty(itemName)) {
        const itemData = aiResultWithIds[itemName];
        let combinedPoly = null;
        
        if (itemData?.ids?.length > 0) {
          const polygons = itemData.ids
            .map(id => {
              const element = ocrElementMap.get(id);
              return element?.boundingPoly;
            })
            .filter(p => p);
          
          if (polygons.length > 0) {
            combinedPoly = calculateCombinedBoundingPoly(polygons);
          }
        }
        
        finalResult[itemName] = {
          value: itemData?.value ?? itemData ?? null,
          boundingPoly: combinedPoly
        };
      }
    }
    
    return finalResult;
  };

  const calculateCombinedBoundingPoly = (polygons) => {
    if (!polygons || polygons.length === 0) return null;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let hasValidVertices = false;
    
    for (const poly of polygons) {
      if (poly?.vertices && Array.isArray(poly.vertices)) {
        for (const vertex of poly.vertices) {
          if (vertex && typeof vertex.x === 'number' && typeof vertex.y === 'number') {
            minX = Math.min(minX, vertex.x);
            minY = Math.min(minY, vertex.y);
            maxX = Math.max(maxX, vertex.x);
            maxY = Math.max(maxY, vertex.y);
            hasValidVertices = true;
          }
        }
      }
    }
    
    if (!hasValidVertices) return null;
    
    return {
      vertices: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
      ]
    };
  };

  const handleStructure = async () => {
    const currentOcrElements = allOcrElements[currentFileIndex] || ocrElements;
    
    if (!ocrText || !currentOcrElements || currentOcrElements.length === 0) {
      alert('まずOCR実行をしてください');
      return;
    }

    setIsLoading(true);
    setOcrText('OpenAIで構造化中...');

    const openaiKey = process.env.REACT_APP_OPENAI_API_KEY;
    const base64Image = image.split(',')[1];
    
    const simplifiedOcrData = currentOcrElements.map(el => ({
      id: el.id,
      description: el.description
    }));

    const prompt = `
あなたは不動産賃貸物件のレシートを解析する専門AIです。
以下の**画像**と、それに対応するOCR結果データを注意深く分析し、指定されたJSONスキーマに従って情報を抽出してください。

**重要：各項目について、抽出した値がOCR結果のどの要素（複数可）に基づいているかを特定し、対応する要素のIDをリスト形式で'ids'フィールドに設定してください。**

以下がOCR結果データです：
${JSON.stringify(simplifiedOcrData, null, 2)}

抽出項目：
- 店名：屋号や店舗のブランド名を優先
- 日付：YYYY年MM月DD日形式
- 合計金額：数字のみ
- 消費税額：数字のみ
- 品目：商品リスト
- 支払方法：支払い方法
- 勘定科目提案：勘定科目3つ

形式（必ず以下の形式で返してください）：
{
  "店名": {"value": "店名", "ids": [対応するID]},
  "日付": {"value": "YYYY年MM月DD日", "ids": [対応するID]},
  "合計金額": {"value": 数字, "ids": [対応するID]},
  "消費税額": {"value": 数字, "ids": [対応するID]},
  "品目": {"value": ["商品1", "商品2"], "ids": [対応するID]},
  "支払方法": {"value": "...", "ids": [対応するID]},
  "勘定科目提案": {"value": ["科目1", "科目2", "科目3"], "ids": []}
}`;

    const requestBody = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      temperature: 0,
      max_tokens: 4000
    };

    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          body: JSON.stringify(requestBody)
        }
      );

      const data = await response.json();
      const result = data.choices[0].message.content;

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const structuredDataWithIds = JSON.parse(jsonMatch[0]);
        const finalResult = reconstructBoundingPolys(
          structuredDataWithIds,
          currentOcrElements 
        );
        
        setStructuredData(finalResult);
        setOcrText('構造化完了');
        
        const updatedAllData = {...allStructuredData};
        updatedAllData[currentFileIndex] = finalResult;
        setAllStructuredData(updatedAllData);
        showMessage('データの構造化が完了しました！', 'success');
      }
    } catch (error) {
      console.error('OpenAI error:', error);
      setOcrText('OpenAIエラー：' + error.message);
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
    
    const saveData = {};
    for (const key in structuredData) {
      saveData[key] = structuredData[key]?.value ?? null;
    }
    
    const fd = new FormData();
    fd.append('payload', JSON.stringify(saveData));

    try {
      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: fd
      });

      showMessage(`${currentFileIndex + 1}番目のデータを保存しました！`, 'success');

      const newProcessedFiles = [...processedFiles, currentFileIndex];
      setProcessedFiles(newProcessedFiles);

      const allDone = fileQueue.every((_, idx) => newProcessedFiles.includes(idx));

      if (!allDone) {
        const unprocessedIndex = fileQueue.findIndex((_, idx) => !newProcessedFiles.includes(idx));
        
        if (unprocessedIndex !== -1) {
          setCurrentFileIndex(unprocessedIndex);

          const nextFile = fileQueue[unprocessedIndex].file;
          setFileName(
            nextFile.name.length > 20
              ? nextFile.name.substring(0, 17) + '...'
              : nextFile.name
          );
          setFileSize(formatFileSize(nextFile.size));
          setImageRotation(0);

          const reader = new FileReader();
          reader.onload = async (event) => {
            const compressed = await compressImage(nextFile);
            setImage(compressed);
          };
          reader.readAsDataURL(nextFile);

          if (allStructuredData[unprocessedIndex]) {
            setStructuredData(allStructuredData[unprocessedIndex]);
            setOcrElements(allOcrElements[unprocessedIndex] || []);
            setOcrText('構造化完了');
          } else {
            setOcrText('');
            setStructuredData(null);
            setOcrElements([]);
          }
          
          showMessage(`📝 未処理のファイル（${unprocessedIndex + 1}/${fileQueue.length}）を表示しました`, 'info');
        }

      } else {
        showMessage('🎉 すべてのファイルの処理が完了しました！', 'success');

        setTimeout(() => {
          if (window.confirm('すべての処理が完了しました。新しいファイルを選択しますか？')) {
            setFileQueue([]);
            setCurrentFileIndex(0);
            setImage(null);
            setOcrText('');
            setStructuredData(null);
            setOcrElements([]);
            setAllStructuredData({});
            setAllOcrTexts({});
            setAllOcrElements({});
            setProcessedFiles([]);
            setFileName('');
            setFileSize('');
            setImageRotation(0);
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

  const drawBoundingBoxes = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    
    if (!canvas || !img) {
      return;
    }
    
    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    if (!parent) return;
    
    const parentWidth = parent.clientWidth;
    const parentHeight = parent.clientHeight;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = parentWidth * dpr;
    canvas.height = parentHeight * dpr;
    
    canvas.style.width = `${parentWidth}px`;
    canvas.style.height = `${parentHeight}px`;
    
    ctx.scale(dpr, dpr);
    
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const canvasAspect = parentWidth / parentHeight;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (imgAspect > canvasAspect) {
      drawWidth = parentWidth;
      drawHeight = parentWidth / imgAspect;
      offsetX = 0;
      offsetY = (parentHeight - drawHeight) / 2;
    } else {
      drawWidth = parentHeight * imgAspect;
      drawHeight = parentHeight;
      offsetX = (parentWidth - drawWidth) / 2;
      offsetY = 0;
    }
    
    ctx.clearRect(0, 0, parentWidth, parentHeight);
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    
    if (!showBoundingBoxes || !structuredData) {
      return;
    }
    
    const scaleX = drawWidth / img.naturalWidth;
    const scaleY = drawHeight / img.naturalHeight;
    
    let drawnCount = 0;
    for (const itemName in structuredData) {
      const item = structuredData[itemName];
      
      if (!item?.boundingPoly?.vertices || item.boundingPoly.vertices.length !== 4) {
        continue;
      }
      
      const vertices = item.boundingPoly.vertices;
      const isHighlighted = highlightedItem === itemName;
      
      ctx.strokeStyle = isHighlighted ? '#ff0000' : '#00ff00';
      ctx.lineWidth = isHighlighted ? 3 : 2;
      ctx.fillStyle = isHighlighted 
        ? 'rgba(255, 0, 0, 0.2)' 
        : 'rgba(0, 255, 0, 0.15)';
      
      ctx.beginPath();
      ctx.moveTo(
        offsetX + vertices[0].x * scaleX,
        offsetY + vertices[0].y * scaleY
      );
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(
          offsetX + vertices[i].x * scaleX,
          offsetY + vertices[i].y * scaleY
        );
      }
      ctx.closePath();
      
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = isHighlighted ? '#ff0000' : '#00ff00';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(
        itemName,
        offsetX + vertices[0].x * scaleX + 5,
        offsetY + vertices[0].y * scaleY - 5
      );
      
      drawnCount++;
    }
  }, [structuredData, showBoundingBoxes, highlightedItem]);

  useEffect(() => {
    if (image) {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setTimeout(() => {
          drawBoundingBoxes();
        }, 100);
      };
      img.src = image;
    }
  }, [image, structuredData, showBoundingBoxes, highlightedItem, drawBoundingBoxes]);

  // ★ 高速化された一括処理
  const handleBatchProcess = async () => {
    if (fileQueue.length === 0) {
      alert('ファイルが選択されていません');
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);
    setIsProcessingQueue(true);
    setIsCancelling(false);
    showMessage('🚀 高速並列処理を開始します...', 'success');
    
    const tempStructuredData = {};
    const tempOcrTexts = {};
    const tempOcrElements = {};
    let processedCount = 0;

    try {
      const processingPromises = fileQueue.map(async (file, globalIndex) => {
        console.log(`⏱️ ファイル${globalIndex + 1}の処理開始`);
        const startTime = Date.now();
        
        try {
          if (controller.signal.aborted) {
            throw new Error('CANCELLED');
          }

          // 1. ファイル読み込み＆圧縮（高速化）
          const base64Image = await new Promise(async (resolve, reject) => {
            try {
              const compressed = await compressImage(file.file, 800);
              resolve(compressed.split(',')[1]);
            } catch (e) {
              reject(e);
            }
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
                  features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                  imageContext: { languageHints: ['ja'] }
                }]
              }),
              signal: controller.signal
            }
          );

          if (controller.signal.aborted) {
            throw new Error('CANCELLED');
          }

          const ocrData = await ocrResponse.json();
          const textAnnotations = ocrData.responses[0].textAnnotations || [];
          const ocrTextResult = textAnnotations[0]?.description || '文字が検出されませんでした';
          tempOcrTexts[globalIndex] = ocrTextResult;
          
          // OCR要素を保存
          const ocrElementsWithId = textAnnotations.slice(1).map((annotation, index) => ({
            id: index,
            description: annotation.description,
            boundingPoly: annotation.boundingPoly
          }));
          tempOcrElements[globalIndex] = ocrElementsWithId;

          // 3. 簡略化されたOCRデータでAI構造化
          const simplifiedOcrData = ocrElementsWithId.map(el => ({
            id: el.id,
            description: el.description
          }));

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
                  content: [
                    {
                      type: "text",
                      text: `レシートから以下の情報を抽出してJSON形式で返してください。

OCRデータ：
${JSON.stringify(simplifiedOcrData, null, 2)}

**重要：各項目のvalue値と、対応するOCR要素のIDをids配列に入れてください。**

{
  "店名": {"value": "店名", "ids": [対応するID]},
  "日付": {"value": "YYYY年MM月DD日", "ids": [対応するID]},
  "合計金額": {"value": 数字, "ids": [対応するID]},
  "消費税額": {"value": 数字, "ids": [対応するID]},
  "品目": {"value": ["商品1", "商品2"], "ids": [対応するID]},
  "支払方法": {"value": "支払い方法", "ids": [対応するID]},
  "勘定科目提案": {"value": ["科目1", "科目2", "科目3"], "ids": []}
}`
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:image/jpeg;base64,${base64Image}`
                      }
                    }
                  ]
                }],
                temperature: 0,
                max_tokens: 1000
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
            const rawData = JSON.parse(jsonMatch[0]);
            
            // BoundingPoly付きでデータ保存
            const finalResult = reconstructBoundingPolys(rawData, ocrElementsWithId);
            tempStructuredData[globalIndex] = finalResult;
          }

          processedCount++;
          
          setMessage({ 
            show: true, 
            text: `⚡ 並列処理: ${processedCount}/${fileQueue.length} (${Math.round((processedCount / fileQueue.length) * 100)}%)`, 
            type: 'success' 
          });

          const endTime = Date.now();
          console.log(`✅ ファイル${globalIndex + 1}完了 (${(endTime - startTime) / 1000}秒)`);
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

      await Promise.all(processingPromises);

      setAllStructuredData(tempStructuredData);
      setAllOcrTexts(tempOcrTexts);
      setAllOcrElements(tempOcrElements);
      
      if (tempStructuredData[0]) {
        setStructuredData(tempStructuredData[0]);
        setOcrElements(tempOcrElements[0] || []);
        setOcrText('構造化完了');
        
        const reader = new FileReader();
        reader.onload = async (event) => {
          const compressed = await compressImage(fileQueue[0].file);
          setImage(compressed);
        };
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
          setAllOcrElements(tempOcrElements);
          
          if (tempStructuredData[0]) {
            setStructuredData(tempStructuredData[0]);
            setOcrElements(tempOcrElements[0] || []);
            setOcrText('構造化完了');
            
            const reader = new FileReader();
            reader.onload = async (event) => {
              const compressed = await compressImage(fileQueue[0].file);
              setImage(compressed);
            };
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
            
            {fileQueue.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('すべてのファイルと処理データをクリアして、新しく始めますか？')) {
                    setFileQueue([]);
                    setCurrentFileIndex(0);
                    setImage(null);
                    setOcrText('');
                    setStructuredData(null);
                    setOcrElements([]);
                    setAllStructuredData({});
                    setAllOcrTexts({});
                    setAllOcrElements({});
                    setProcessedFiles([]);
                    setFileName('');
                    setFileSize('');
                    setIsEditing(false);
                    setEditedData(null);
                    setImageRotation(0);
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
                let status = 'unprocessed';
                if (processedFiles.includes(index)) {
                  status = 'confirmed';
                } else if (allStructuredData[index]) {
                  status = 'draft';
                }
                
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
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
                      title="このファイルを削除"
                    >
                      ×
                    </button>

                    <div
                      onClick={() => {
                        setCurrentFileIndex(index);
                        const selectedFile = fileQueue[index].file;
                        setFileName(selectedFile.name);
                        setFileSize(formatFileSize(selectedFile.size));
                        setImageRotation(0);
                        
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                          const compressed = await compressImage(selectedFile);
                          setImage(compressed);
                          if (allStructuredData && allStructuredData[index]) {
                            setStructuredData(allStructuredData[index]);
                            setOcrElements(allOcrElements[index] || []);
                            setOcrText('構造化完了');
                          } else {
                            setOcrText('');
                            setStructuredData(null);
                            setOcrElements([]);
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
                      
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '15px',
                          fontWeight: 'bold',
                          color: index === currentFileIndex ? 'white' : '#333'
                        }}>
                          {allStructuredData[index]?.店名?.value || file.name.substring(0, 10)}
                        </div>
                        <div style={{
                          fontSize: '14px',
                          color: index === currentFileIndex ? '#f0f0f0' : '#666'
                        }}>
                          {allStructuredData[index]?.日付?.value || '---'}
                        </div>
                        <div style={{
                          fontSize: '14px',
                          color: index === currentFileIndex ? '#f0f0f0' : '#666'
                        }}>
                          {allStructuredData[index] ? `¥${allStructuredData[index].合計金額?.value?.toLocaleString() || '---'}` : ''}
                        </div>
                      </div>
                      
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
            
            <div style={{ display: 'flex', gap: '8px' }}>
              {/* 回転ボタン（新規追加） */}
              {image && (
                <button
                  onClick={handleRotateImage}
                  style={{
                    padding: '8px 16px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  title={`画像を回転 (現在: ${imageRotation}度)`}
                >
                  🔄 回転
                </button>
              )}
              
              {structuredData && (
                <button
                  onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                  style={{
                    padding: '8px 16px',
                    background: showBoundingBoxes 
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  {showBoundingBoxes ? '📦 BBox: ON' : '📦 BBox: OFF'}
                </button>
              )}
            </div>
          </div>
          
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 20%, #ffecd2 100%)',
            borderRadius: '12px',
            overflow: 'hidden',
            position: 'relative',
            minHeight: '400px',
            maxHeight: '80vh'
          }}>
            {image ? (
              <canvas
                ref={canvasRef}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  cursor: 'pointer'
                }}
                onClick={() => setShowModal(true)}
              />
            ) : (
              <div style={{ textAlign: 'center', color: '#999' }}>
                画像を選択してください
              </div>
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

          {fileQueue.length > 1 && structuredData && (
            <button
              onClick={() => {
                const nextIndex = (currentFileIndex + 1) % fileQueue.length;
                setCurrentFileIndex(nextIndex);
                setImageRotation(0);
                
                const nextFile = fileQueue[nextIndex].file;
                setFileName(nextFile.name);
                setFileSize(formatFileSize(nextFile.size));
                
                const reader = new FileReader();
                reader.onload = async (event) => {
                  const compressed = await compressImage(nextFile);
                  setImage(compressed);
                  
                  if (allStructuredData && allStructuredData[nextIndex]) {
                    setStructuredData(allStructuredData[nextIndex]);
                    setOcrElements(allOcrElements[nextIndex] || []);
                    setOcrText('構造化完了');
                  } else {
                    setOcrText('');
                    setStructuredData(null);
                    setOcrElements([]);
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
                {!isEditing && (
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      const editData = {};
                      for (const key in structuredData) {
                        editData[key] = structuredData[key]?.value ?? null;
                      }
                      setEditedData(editData);
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

                {!isEditing && (
                  <>
                    <div className="result-item"
                      onMouseEnter={() => setHighlightedItem('店名')}
                      onMouseLeave={() => setHighlightedItem(null)}
                      style={{
                        cursor: 'pointer',
                        background: highlightedItem === '店名' ? '#e0f2fe' : 'transparent',
                        padding: '8px',
                        borderRadius: '8px',
                        transition: 'background 0.2s',
                        border: highlightedItem === '店名' ? '2px solid #0ea5e9' : '2px solid transparent'
                      }}
                    >
                      <span className="result-label">店名:</span>
                      <span className="result-value">{structuredData.店名?.value}</span>
                    </div>

                    <div className="result-item"
                      onMouseEnter={() => setHighlightedItem('日付')}
                      onMouseLeave={() => setHighlightedItem(null)}
                      style={{
                        cursor: 'pointer',
                        background: highlightedItem === '日付' ? '#e0f2fe' : 'transparent',
                        padding: '8px',
                        borderRadius: '8px',
                        transition: 'background 0.2s',
                        border: highlightedItem === '日付' ? '2px solid #0ea5e9' : '2px solid transparent'
                      }}
                    >
                      <span className="result-label">日付:</span>
                      <span className="result-value">{structuredData.日付?.value}</span>
                    </div>

                    <div className="result-item"
                      onMouseEnter={() => setHighlightedItem('合計金額')}
                      onMouseLeave={() => setHighlightedItem(null)}
                      style={{
                        cursor: 'pointer',
                        background: highlightedItem === '合計金額' ? '#e0f2fe' : 'transparent',
                        padding: '8px',
                        borderRadius: '8px',
                        transition: 'background 0.2s',
                        border: highlightedItem === '合計金額' ? '2px solid #0ea5e9' : '2px solid transparent'
                      }}
                    >
                      <span className="result-label">合計金額:</span>
                      <span className="result-value">¥{structuredData.合計金額?.value?.toLocaleString()}</span>
                    </div>

                    <div className="result-item"
                      onMouseEnter={() => setHighlightedItem('消費税額')}
                      onMouseLeave={() => setHighlightedItem(null)}
                      style={{
                        cursor: 'pointer',
                        background: highlightedItem === '消費税額' ? '#e0f2fe' : 'transparent',
                        padding: '8px',
                        borderRadius: '8px',
                        transition: 'background 0.2s',
                        border: highlightedItem === '消費税額' ? '2px solid #0ea5e9' : '2px solid transparent'
                      }}
                    >
                      <span className="result-label">消費税額:</span>
                      <span className="result-value">¥{structuredData.消費税額?.value?.toLocaleString()}</span>
                    </div>

                    <div className="result-item"
                      onMouseEnter={() => setHighlightedItem('品目')}
                      onMouseLeave={() => setHighlightedItem(null)}
                      style={{
                        cursor: 'pointer',
                        background: highlightedItem === '品目' ? '#e0f2fe' : 'transparent',
                        padding: '8px',
                        borderRadius: '8px',
                        transition: 'background 0.2s',
                        border: highlightedItem === '品目' ? '2px solid #0ea5e9' : '2px solid transparent'
                      }}
                    >
                      <span className="result-label">品目:</span>
                      <div style={{ marginTop: '8px' }}>
                        {structuredData.品目?.value?.map((item, i) => (
                          <div key={i} style={{ padding: '4px 0' }}>・{item}</div>
                        ))}
                      </div>
                    </div>

                    <div className="result-item"
                      onMouseEnter={() => setHighlightedItem('支払方法')}
                      onMouseLeave={() => setHighlightedItem(null)}
                      style={{
                        cursor: 'pointer',
                        background: highlightedItem === '支払方法' ? '#e0f2fe' : 'transparent',
                        padding: '8px',
                        borderRadius: '8px',
                        transition: 'background 0.2s',
                        border: highlightedItem === '支払方法' ? '2px solid #0ea5e9' : '2px solid transparent'
                      }}
                    >
                      <span className="result-label">支払方法:</span>
                      <span className="result-value">{structuredData.支払方法?.value}</span>
                    </div>

                    <div className="result-item"
                      onMouseEnter={() => setHighlightedItem('勘定科目提案')}
                      onMouseLeave={() => setHighlightedItem(null)}
                      style={{
                        cursor: 'pointer',
                        background: highlightedItem === '勘定科目提案' ? '#e0f2fe' : 'transparent',
                        padding: '8px',
                        borderRadius: '8px',
                        transition: 'background 0.2s',
                        border: highlightedItem === '勘定科目提案' ? '2px solid #0ea5e9' : '2px solid transparent'
                      }}
                    >
                      <span className="result-label">勘定科目提案:</span>
                      <div style={{ marginTop: '8px' }}>
                        {structuredData.勘定科目提案?.value?.map((item, i) => (
                          <div key={i} style={{ padding: '4px 0' }}>{i + 1}. {item}</div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {isEditing && editedData && (
                  <>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', color: '#5E35B1' }}>
                      📝 データを編集
                    </h3>

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

                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                      <button
                        onClick={async () => {
                          const formattedData = {};
                          for (const key in editedData) {
                            formattedData[key] = {
                              value: editedData[key],
                              boundingPoly: structuredData[key]?.boundingPoly || null
                            };
                          }
                          
                          setStructuredData(formattedData);
                          setIsEditing(false);
                          
                          const updatedAllData = {...allStructuredData};
                          updatedAllData[currentFileIndex] = formattedData;
                          setAllStructuredData(updatedAllData);
                          
                          const newProcessedFiles = [...processedFiles, currentFileIndex];
                          setProcessedFiles(newProcessedFiles);
                          
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
                            
                            const allDone = fileQueue.every((_, idx) => newProcessedFiles.includes(idx));
                            
                            if (!allDone) {
                              const unprocessedIndex = fileQueue.findIndex((_, idx) => !newProcessedFiles.includes(idx));
                              
                              if (unprocessedIndex !== -1) {
                                setCurrentFileIndex(unprocessedIndex);
                                setImageRotation(0);
                                
                                const nextFile = fileQueue[unprocessedIndex].file;
                                setFileName(nextFile.name.length > 20 ? nextFile.name.substring(0, 17) + '...' : nextFile.name);
                                setFileSize(formatFileSize(nextFile.size));
                                
                                const reader = new FileReader();
                                reader.onload = async (event) => {
                                  const compressed = await compressImage(nextFile);
                                  setImage(compressed);
                                };
                                reader.readAsDataURL(nextFile);
                                
                                if (allStructuredData[unprocessedIndex]) {
                                  setStructuredData(allStructuredData[unprocessedIndex]);
                                  setOcrElements(allOcrElements[unprocessedIndex] || []);
                                  setOcrText('構造化完了');
                                } else {
                                  setOcrText('');
                                  setStructuredData(null);
                                  setOcrElements([]);
                                }
                                
                                showMessage(`📝 未処理のファイル（${unprocessedIndex + 1}/${fileQueue.length}）を表示しました`, 'info');
                              }
                            } else {
                              showMessage('🎉 すべてのファイルの処理が完了しました！', 'success');
                              
                              setTimeout(() => {
                                if (window.confirm('すべての処理が完了しました。新しいファイルを選択しますか？')) {
                                  setFileQueue([]);
                                  setCurrentFileIndex(0);
                                  setImage(null);
                                  setOcrText('');
                                  setStructuredData(null);
                                  setOcrElements([]);
                                  setAllStructuredData({});
                                  setAllOcrTexts({});
                                  setAllOcrElements({});
                                  setProcessedFiles([]);
                                  setFileName('');
                                  setFileSize('');
                                  setEditedData(null);
                                  setImageRotation(0);
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
                          boxShadow: '0 3px 10px hsla(0, 0%, 62%, 0.30)',
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