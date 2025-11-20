import "./App.css";
import React, { useState, useRef, useEffect, useCallback } from "react";
console.log("GAS URL:", process.env.REACT_APP_GAS_URL);

// ★ 画像圧縮：Vision API を高速化（超重要）★
const compressImage = (file, maxSize = 800, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // JPEGで圧縮率を調整（速度改善）
      const compressedBase64 = canvas.toDataURL("image/jpeg", quality);
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
  const [ocrText, setOcrText] = useState("");
  const [structuredData, setStructuredData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState({ show: false, text: "", type: "" });
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
  const [filterStatus, setFilterStatus] = useState("all");
  const [ocrElements, setOcrElements] = useState([]);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [highlightedItem, setHighlightedItem] = useState(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  // ★ 画像回転用のState（新規追加）★
  const [rotation, setRotation] = useState(0);
  // ズーム・パン機能用のState
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastPanOffset, setLastPanOffset] = useState({ x: 0, y: 0 });

  // ズーム設定
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.1;

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const showMessage = (text, type) => {
    setMessage({ show: true, text, type });
    setTimeout(() => {
      setMessage({ show: false, text: "", type: "" });
    }, 3000);
  };

  // ズームリセット関数
  const resetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setLastPanOffset({ x: 0, y: 0 });
  };

  // ズーム処理（マウス位置を中心に）
  const handleZoom = useCallback((delta, mouseX = null, mouseY = null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    // ズーム中心点の計算（デフォルトは画像の中央上部）
    let centerX, centerY;

    if (mouseX !== null && mouseY !== null) {
      // マウス/タッチ位置が指定されている場合
      centerX = mouseX - rect.left;
      centerY = mouseY - rect.top;
    } else {
      // ボタンクリックの場合：中央やや上部を中心に
      centerX = rect.width / 2;
      centerY = rect.height * 0.35; // 35%の位置（やや上部）
    }

    setZoomLevel((prevZoom) => {
      const newZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, prevZoom * (1 + delta))
      );
      const zoomRatio = newZoom / prevZoom;

      if (zoomRatio !== 1) {
        setPanOffset((prevPan) => ({
          x: centerX - (centerX - prevPan.x) * zoomRatio,
          y: centerY - (centerY - prevPan.y) * zoomRatio,
        }));
      }

      return newZoom;
    });
  }, []);

  // ★ マウスホイールイベント（改善版）
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1; // スムーズな増減
      handleZoom(delta, e.clientX, e.clientY);
    },
    [handleZoom]
  );

  // ピンチジェスチャー用
  const touchStartRef = useRef(null);
  const lastTouchCenter = useRef(null);

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];

      // 2本指の距離を計算
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      touchStartRef.current = Math.sqrt(dx * dx + dy * dy);

      // 2本指の中心点を保存
      lastTouchCenter.current = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && touchStartRef.current) {
      e.preventDefault();

      const touch1 = e.touches[0];
      const touch2 = e.touches[1];

      // 現在の2本指の距離
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 現在の2本指の中心点
      const currentCenter = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      };

      // ズーム率の計算（より自然な感覚に）
      const scale = distance / touchStartRef.current;
      const delta = (scale - 1) * 0.02; // 感度調整

      // 2本指の中心点でズーム
      handleZoom(delta, currentCenter.x, currentCenter.y);

      // パン操作も同時に行う（中心点の移動を追従）
      if (lastTouchCenter.current && zoomLevel > 1) {
        const panDx = currentCenter.x - lastTouchCenter.current.x;
        const panDy = currentCenter.y - lastTouchCenter.current.y;

        setPanOffset((prev) => ({
          x: prev.x + panDx * 0.5, // パン感度を調整
          y: prev.y + panDy * 0.5,
        }));
      }

      touchStartRef.current = distance;
      lastTouchCenter.current = currentCenter;
    }
  };

  // ドラッグ操作
  const handleMouseDown = (e) => {
    if (e.button === 0 && zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setLastPanOffset({ ...panOffset });
      e.preventDefault();
    }
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setPanOffset({
          x: lastPanOffset.x + dx,
          y: lastPanOffset.y + dy,
        });
      }
    },
    [isDragging, dragStart, lastPanOffset]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleCancelBatch = () => {
    if (abortController) {
      setIsCancelling(true);
      abortController.abort();
      showMessage("🛑 処理をキャンセル中...", "warning");
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
      setOcrText("");
      setStructuredData(null);
      setFileName("");
      setFileSize("");
      setIsEditing(false);
      setEditedData(null);
      setRotation(0);
      resetZoom();
      showMessage("すべてのファイルが削除されました", "info");
    } else if (currentFileIndex === indexToDelete) {
      const newIndex = 0;
      setCurrentFileIndex(newIndex);

      const firstFile = newFileQueue[newIndex].file;
      setFileName(
        firstFile.name.length > 20
          ? firstFile.name.substring(0, 17) + "..."
          : firstFile.name
      );
      setFileSize(formatFileSize(firstFile.size));

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const compressed = await compressImage(firstFile, 800, 0.7);
          setImage(compressed);
        } catch (e) {
          setImage(event.target.result);
        }
      };
      reader.readAsDataURL(firstFile);

      if (newAllStructuredData[newIndex]) {
        setStructuredData(newAllStructuredData[newIndex]);
        setOcrText("構造化完了");
      } else {
        setOcrText("");
        setStructuredData(null);
      }
      setIsEditing(false);
      setEditedData(null);
      setRotation(0);
      showMessage(
        `ファイルを削除しました（残り${newFileQueue.length}個）`,
        "success"
      );
    } else if (currentFileIndex > indexToDelete) {
      setCurrentFileIndex(currentFileIndex - 1);
      showMessage(
        `ファイルを削除しました（残り${newFileQueue.length}個）`,
        "success"
      );
    } else {
      showMessage(
        `ファイルを削除しました（残り${newFileQueue.length}個）`,
        "success"
      );
    }
  };

  const handleChange = async (e) => {
    const files = Array.from(e.target.files);

    if (files.length === 0) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    const maxSize = 5 * 1024 * 1024;

    for (let file of files) {
      if (!validTypes.includes(file.type)) {
        alert(
          `${file.name} はサポートされていない形式です。JPG、PNG、GIF形式の画像を選択してください`
        );
        return;
      }
      if (file.size > maxSize) {
        alert(
          `${file.name} のファイルサイズが大きすぎます。5MB以下にしてください`
        );
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
      setOcrText("");
      setStructuredData(null);
      setIsLoading(false);
      setRotation(0);
    }

    const baseIndex = isAddMode ? fileQueue.length : 0;
    const fileInfos = files.map((file, index) => ({
      id: Date.now() + baseIndex + index,
      file: file,
      name: file.name,
      status: "待機中",
      preview: URL.createObjectURL(file),
    }));

    if (isAddMode) {
      setFileQueue([...fileQueue, ...fileInfos]);
      showMessage(
        `${files.length}個のファイルを追加しました（合計${
          fileQueue.length + files.length
        }個）`,
        "success"
      );
    } else {
      setFileQueue(fileInfos);
      setCurrentFileIndex(0);

      const firstFile = files[0];
      setFileName(
        firstFile.name.length > 20
          ? firstFile.name.substring(0, 17) + "..."
          : firstFile.name
      );
      setFileSize(formatFileSize(firstFile.size));

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const compressed = await compressImage(firstFile, 800, 0.7);
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

  // ★ 画像回転関数（新規追加）★
  const handleRotate = () => {
    const newRotation = (rotation + 90) % 360;
    setRotation(newRotation);
  };

  // BBoxクリック処理の完全版（回転を考慮した座標変換を含む）

  // BBoxクリック処理の完全版（回転 + 拡大縮小 + パン対応）
  const handleCanvasClick = useCallback(
    (e) => {
      if (!structuredData || !showBoundingBoxes || isDragging) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // キャンバス座標を画像座標に変換
      const imgX = (clickX - panOffset.x) / zoomLevel;
      const imgY = (clickY - panOffset.y) / zoomLevel;

      const img = imageRef.current;
      if (!img) return;

      const parent = canvas.parentElement;
      const parentWidth = parent.clientWidth;
      const parentHeight = parent.clientHeight;

      // アスペクト比
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = parentWidth / parentHeight;

      let drawWidth, drawHeight, offsetX, offsetY;

      // 回転による描画サイズ計算
      if (rotation === 90 || rotation === 270) {
        if (imgAspect > canvasAspect) {
          drawHeight = parentWidth;
          drawWidth = parentWidth / imgAspect;
          offsetX = (parentWidth - drawWidth) / 2;
          offsetY = (parentHeight - drawHeight) / 2;
        } else {
          drawWidth = parentHeight * imgAspect;
          drawHeight = parentHeight;
          offsetX = (parentWidth - drawWidth) / 2;
          offsetY = (parentHeight - drawHeight) / 2;
        }
      } else {
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
      }

      // 中心座標（ズーム適用後）
      const centerX = parentWidth / 2 / zoomLevel;
      const centerY = parentHeight / 2 / zoomLevel;

      // 中心基準に変換
      let transformedX = imgX - centerX;
      let transformedY = imgY - centerY;

      // 逆回転を適用
      const radians = -(rotation * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);

      const rotatedX = transformedX * cos - transformedY * sin;
      const rotatedY = transformedX * sin + transformedY * cos;

      // 元の画像サイズ基準での座標
      const originalX = rotatedX + drawWidth / 2;
      const originalY = rotatedY + drawHeight / 2;

      // 実際のスケール
      const scaleX = drawWidth / img.naturalWidth;
      const scaleY = drawHeight / img.naturalHeight;

      // BBox とクリック判定
      for (const itemName in structuredData) {
        const item = structuredData[itemName];
        if (!item?.boundingPoly?.vertices) continue;

        const vertices = item.boundingPoly.vertices;

        const transformedVertices = vertices.map((v) => ({
          x: offsetX + v.x * scaleX,
          y: offsetY + v.y * scaleY,
        }));

        // ★ ゆとり判定：クリックを 8px 広げて当たりやすくする
        if (
          isPointInExpandedRect(originalX, originalY, transformedVertices, 8)
        ) {
          setHighlightedItem(itemName);

          const formElement = document.querySelector(
            `[data-field-name="${itemName}"]`
          );

          if (formElement) {
            formElement.scrollIntoView({ behavior: "smooth", block: "center" });

            // ハイライト演出
            formElement.style.transition = "all 0.3s ease";
            formElement.style.transform = "scale(1.05)";
            formElement.style.boxShadow = "0 8px 20px rgba(14, 165, 233, 0.4)";

            setTimeout(() => {
              formElement.style.transform = "scale(1)";
              formElement.style.boxShadow = "";
            }, 500);
          }

          return;
        }
      }

      // 当たらなかった場合
      setHighlightedItem(null);
    },
    [
      structuredData,
      showBoundingBoxes,
      zoomLevel,
      panOffset,
      rotation,
      isDragging,
    ]
  );

  // 点が多角形内にあるか判定するヘルパー関数（Ray Casting）
  const isPointInPolygon = (x, y, vertices) => {
    let inside = false;

    return inside;
  };

  // ★ クリック範囲を広げた矩形判定（パディング付きバージョン）
  const isPointInExpandedRect = (x, y, vertices, padding = 8) => {
    const minX = Math.min(...vertices.map((v) => v.x)) - padding;
    const maxX = Math.max(...vertices.map((v) => v.x)) + padding;
    const minY = Math.min(...vertices.map((v) => v.y)) - padding;
    const maxY = Math.max(...vertices.map((v) => v.y)) + padding;

    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  };

  // 別の判定方法：矩形判定（シンプル版）
  const isPointInRect = (x, y, vertices) => {
    // 矩形の場合のシンプルな判定
    const minX = Math.min(...vertices.map((v) => v.x));
    const maxX = Math.max(...vertices.map((v) => v.x));
    const minY = Math.min(...vertices.map((v) => v.y));
    const maxY = Math.max(...vertices.map((v) => v.y));

    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  };

  const handleOCR = async () => {
    setIsLoading(true);
    setOcrText("処理中...");

    const apiKey = process.env.REACT_APP_VISION_API_KEY;
    const base64Image = image.split(",")[1];

    const requestBody = {
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints: ["ja"] },
        },
      ],
    };

    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      const data = await response.json();
      const textAnnotations = data.responses[0].textAnnotations || [];

      const ocrElementsWithId = textAnnotations
        .slice(1)
        .map((annotation, index) => ({
          id: index,
          description: annotation.description,
          boundingPoly: annotation.boundingPoly,
        }));

      const fullText =
        textAnnotations[0]?.description || "文字が検出されませんでした";

      setOcrText(fullText);
      setOcrElements(ocrElementsWithId);

      const updatedOcrTexts = { ...allOcrTexts };
      updatedOcrTexts[currentFileIndex] = fullText;
      setAllOcrTexts(updatedOcrTexts);

      const updatedOcrElements = { ...allOcrElements };
      updatedOcrElements[currentFileIndex] = ocrElementsWithId;
      setAllOcrElements(updatedOcrElements);

      showMessage("OCR読み取りが完了しました！", "success");
    } catch (error) {
      console.error("OCR error:", error);
      setOcrText("OCRエラーが発生しました：" + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const reconstructBoundingPolys = (aiResultWithIds, ocrElements) => {
    const finalResult = {};

    const ocrElementMap = new Map(ocrElements.map((el) => [el.id, el]));

    for (const itemName in aiResultWithIds) {
      if (aiResultWithIds.hasOwnProperty(itemName)) {
        const itemData = aiResultWithIds[itemName];
        let combinedPoly = null;

        if (itemData?.ids?.length > 0) {
          const polygons = itemData.ids
            .map((id) => {
              const element = ocrElementMap.get(id);
              return element?.boundingPoly;
            })
            .filter((p) => p);

          if (polygons.length > 0) {
            combinedPoly = calculateCombinedBoundingPoly(polygons);
          }
        }

        finalResult[itemName] = {
          value: itemData?.value ?? null,
          boundingPoly: combinedPoly,
        };
      }
    }

    return finalResult;
  };

  const calculateCombinedBoundingPoly = (polygons) => {
    if (!polygons || polygons.length === 0) return null;

    let minX = Infinity,
      minY = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity;
    let hasValidVertices = false;

    for (const poly of polygons) {
      if (poly?.vertices && Array.isArray(poly.vertices)) {
        for (const vertex of poly.vertices) {
          if (
            vertex &&
            typeof vertex.x === "number" &&
            typeof vertex.y === "number"
          ) {
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
        { x: minX, y: maxY },
      ],
    };
  };

  const handleStructure = async () => {
    const currentOcrElements = allOcrElements[currentFileIndex] || ocrElements;

    if (!ocrText || !currentOcrElements || currentOcrElements.length === 0) {
      alert("まずOCR実行をしてください");
      return;
    }

    setIsLoading(true);
    setOcrText("OpenAIで構造化中...");

    const openaiKey = process.env.REACT_APP_OPENAI_API_KEY;
    const base64Image = image.split(",")[1];

    const simplifiedOcrData = currentOcrElements.map((el) => ({
      id: el.id,
      description: el.description,
    }));

    const prompt = `
あなたは不動産賃貸物件のレシートを解析する専門AIです。
以下の**画像**と、それに対応するOCR結果データを注意深く分析し、指定されたJSONスキーマに従って情報を抽出してください。

**重要：各項目について、抽出した値がOCR結果のどの要素（複数可）に基づいているかを特定し、対応する要素のIDをリスト形式で'ids'フィールドに設定してください。**

以下がOCR結果データです：
${JSON.stringify(simplifiedOcrData, null, 2)}

抽出項目と形式：
{
  "店名": {"value": "屋号のみ", "ids": [...]},
  "日付": {"value": "YYYY年MM月DD日", "ids": [...]},
  "合計金額": {"value": 数字, "ids": [...]},
  "消費税額": {"value": 数字, "ids": [...]},
  "品目": {"value": ["商品名1", "商品名2", ...], "ids": [...]},
  "支払方法": {"value": "...", "ids": [...]},
  "勘定科目提案": {"value": ["科目1", "科目2", "科目3"], "ids": [...]}
}

重要な指示：
1. 店名は屋号や店舗のブランド名のみを記載してください（法人格は除外）
2. OCRの誤認識を修正してください（例：「血」→「皿」）
3. 品目は商品名と数量を含めてください
4. 日付は必ず「YYYY年MM月DD日」形式に統一してください
5. 各項目のidsには、その項目に関連するOCR要素のIDを配列で設定してください`;

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
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 4000,
    };

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify(requestBody),
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
        setOcrText("構造化完了");

        const updatedAllData = { ...allStructuredData };
        updatedAllData[currentFileIndex] = finalResult;
        setAllStructuredData(updatedAllData);
        showMessage("データの構造化が完了しました！", "success");
      }
    } catch (error) {
      console.error("OpenAI error:", error);
      setOcrText("OpenAIエラー：" + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!structuredData) {
      alert("保存するデータがありません");
      return;
    }

    setIsLoading(true);

    const gasUrl = process.env.REACT_APP_GAS_URL;

    const saveData = {};
    for (const key in structuredData) {
      saveData[key] = structuredData[key]?.value ?? null;
    }

    const fd = new FormData();
    fd.append("payload", JSON.stringify(saveData));

    try {
      await fetch(gasUrl, {
        method: "POST",
        mode: "no-cors",
        body: fd,
      });

      showMessage(
        `${currentFileIndex + 1}番目のデータを保存しました！`,
        "success"
      );
      // ★ 保存成功 → Googleスプレッドシートを自動で開く
      window.open(
        "https://docs.google.com/spreadsheets/d/153YzguHRCzSP_JxRbadQfGnpVTj4x21mP7YvmNrC0zk/edit",
        "_blank"
      );

      const newProcessedFiles = [...processedFiles, currentFileIndex];
      setProcessedFiles(newProcessedFiles);

      const allDone = fileQueue.every((_, idx) =>
        newProcessedFiles.includes(idx)
      );

      if (!allDone) {
        const unprocessedIndex = fileQueue.findIndex(
          (_, idx) => !newProcessedFiles.includes(idx)
        );

        if (unprocessedIndex !== -1) {
          setCurrentFileIndex(unprocessedIndex);

          const nextFile = fileQueue[unprocessedIndex].file;
          setFileName(
            nextFile.name.length > 20
              ? nextFile.name.substring(0, 17) + "..."
              : nextFile.name
          );
          setFileSize(formatFileSize(nextFile.size));

          const reader = new FileReader();
          reader.onload = async (event) => {
            try {
              const compressed = await compressImage(nextFile, 800, 0.7);
              setImage(compressed);
            } catch (e) {
              setImage(event.target.result);
            }
          };
          reader.readAsDataURL(nextFile);

          if (allStructuredData[unprocessedIndex]) {
            setStructuredData(allStructuredData[unprocessedIndex]);
            setOcrText("構造化完了");
            setOcrElements(allOcrElements[unprocessedIndex] || []);
          } else {
            setOcrText("");
            setStructuredData(null);
            setOcrElements([]);
          }

          setRotation(0);
          showMessage(
            `📝 未処理のファイル（${unprocessedIndex + 1}/${
              fileQueue.length
            }）を表示しました`,
            "info"
          );
        }
      } else {
        showMessage("🎉 すべてのファイルの処理が完了しました！", "success");

        setTimeout(() => {
          if (
            window.confirm(
              "すべての処理が完了しました。新しいファイルを選択しますか？"
            )
          ) {
            setFileQueue([]);
            setCurrentFileIndex(0);
            setImage(null);
            setOcrText("");
            setStructuredData(null);
            setAllStructuredData({});
            setAllOcrTexts({});
            setAllOcrElements({});
            setProcessedFiles([]);
            setFileName("");
            setFileSize("");
            setRotation(0);
          }
        }, 1000);
      }
    } catch (e) {
      console.error("[SAVE] fetch error:", e);
      alert("送信エラー: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // drawBoundingBoxes関数の完全版（ズーム・パン・回転対応）

  const drawBoundingBoxes = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;

    if (!canvas || !img) {
      return;
    }

    const ctx = canvas.getContext("2d");

    const parent = canvas.parentElement;
    if (!parent) return;

    const parentWidth = parent.clientWidth;
    const parentHeight = parent.clientHeight;

    // 高解像度ディスプレイ対応
    const dpr = window.devicePixelRatio || 1;
    canvas.width = parentWidth * dpr;
    canvas.height = parentHeight * dpr;

    canvas.style.width = `${parentWidth}px`;
    canvas.style.height = `${parentHeight}px`;

    ctx.scale(dpr, dpr);

    // ★ ズームとパンを適用 ★
    ctx.save();

    // 1. パン（移動）を適用
    ctx.translate(panOffset.x, panOffset.y);

    // 2. ズームを適用
    ctx.scale(zoomLevel, zoomLevel);

    // 3. 画像の中心に移動
    ctx.translate(parentWidth / 2 / zoomLevel, parentHeight / 2 / zoomLevel);

    // 4. 回転を適用
    ctx.rotate((rotation * Math.PI) / 180);

    // 画像のアスペクト比を計算
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const canvasAspect = parentWidth / parentHeight;

    let drawWidth, drawHeight, offsetX, offsetY;

    // 回転角度に応じて描画サイズを調整
    if (rotation === 90 || rotation === 270) {
      // 90度または270度回転時はアスペクト比を入れ替える
      if (imgAspect > canvasAspect) {
        drawHeight = parentWidth;
        drawWidth = parentWidth / imgAspect;
        offsetY = -drawHeight / 2;
        offsetX = -drawWidth / 2;
      } else {
        drawWidth = parentHeight * imgAspect;
        drawHeight = parentHeight;
        offsetX = -drawWidth / 2;
        offsetY = -drawHeight / 2;
      }
    } else {
      // 0度または180度回転時
      if (imgAspect > canvasAspect) {
        drawWidth = parentWidth;
        drawHeight = parentWidth / imgAspect;
        offsetX = -drawWidth / 2;
        offsetY = -drawHeight / 2;
      } else {
        drawWidth = parentHeight * imgAspect;
        drawHeight = parentHeight;
        offsetX = -drawWidth / 2;
        offsetY = -drawHeight / 2;
      }
    }

    // 背景をクリア（広い範囲をクリア）
    ctx.clearRect(
      -parentWidth * 2,
      -parentHeight * 2,
      parentWidth * 4,
      parentHeight * 4
    );

    // 画像を描画
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

    // BBoxを描画
    if (showBoundingBoxes && structuredData) {
      // 画像の実際のサイズとOCRの座標の比率を計算
      const scaleX = drawWidth / img.naturalWidth;
      const scaleY = drawHeight / img.naturalHeight;

      // ★ ズームレベルに応じて線の太さを調整 ★
      const baseLineWidth = 2 / zoomLevel;
      const minLineWidth = 0.5;
      const maxLineWidth = 3;
      const lineWidth = Math.min(
        Math.max(baseLineWidth, minLineWidth),
        maxLineWidth
      );

      let drawnCount = 0;

      for (const itemName in structuredData) {
        const item = structuredData[itemName];

        if (
          !item?.boundingPoly?.vertices ||
          item.boundingPoly.vertices.length !== 4
        ) {
          continue;
        }

        const vertices = item.boundingPoly.vertices;
        const isHighlighted = highlightedItem === itemName;

        // 描画スタイルの設定
        if (isHighlighted) {
          // ハイライト時
          ctx.strokeStyle = "#ff0000";
          ctx.lineWidth = lineWidth * 1.5;
          ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
          ctx.shadowColor = "rgba(255, 0, 0, 0.5)";
          ctx.shadowBlur = 10 / zoomLevel;
        } else {
          // 通常時
          ctx.strokeStyle = "#00ff00";
          ctx.lineWidth = lineWidth;
          ctx.fillStyle = "rgba(0, 255, 0, 0.15)";
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
        }

        // BBoxのパスを作成
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

        // 塗りつぶしと枠線を描画
        ctx.fill();
        ctx.stroke();

        // シャドウをリセット
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // ★ ラベルを表示（ズームレベルに応じてフォントサイズを調整）★
        const baseFontSize = 14;
        const minFontSize = 8;
        const maxFontSize = 20;
        const fontSize = Math.min(
          Math.max(baseFontSize / Math.sqrt(zoomLevel), minFontSize),
          maxFontSize
        );

        ctx.fillStyle = isHighlighted ? "#ff0000" : "#00ff00";
        ctx.font = `bold ${fontSize}px Arial`;

        // テキストの背景を描画（可読性向上）
        const textMetrics = ctx.measureText(itemName);
        const textX = offsetX + vertices[0].x * scaleX + 5;
        const textY = offsetY + vertices[0].y * scaleY - 5;

        // 白い背景を描画
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.fillRect(
          textX - 2,
          textY - fontSize - 2,
          textMetrics.width + 4,
          fontSize + 4
        );

        // テキストを描画
        ctx.fillStyle = isHighlighted ? "#ff0000" : "#00ff00";
        ctx.fillText(itemName, textX, textY);

        drawnCount++;
      }

      if (drawnCount > 0) {
        console.log(
          `✅ ${drawnCount}個のBBoxを描画完了 (zoom: ${zoomLevel.toFixed(2)}x)`
        );
      }
    }

    ctx.restore();

    // デバッグ情報を表示（開発時のみ）
    if (process.env.NODE_ENV === "development") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.font = "12px monospace";
      ctx.fillText(`Zoom: ${(zoomLevel * 100).toFixed(0)}%`, 10, 20);
      ctx.fillText(`Rotation: ${rotation}°`, 10, 35);
      ctx.fillText(
        `Pan: (${panOffset.x.toFixed(0)}, ${panOffset.y.toFixed(0)})`,
        10,
        50
      );
    }
  }, [
    structuredData,
    showBoundingBoxes,
    highlightedItem,
    rotation,
    zoomLevel,
    panOffset,
  ]);

  useEffect(() => {
    if (image) {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setTimeout(() => {
          drawBoundingBoxes();
        }, 100);
      };
      img.onerror = (e) => {
        console.error("❌ 画像読み込みエラー:", e);
      };
      img.src = image;
    }
  }, [
    image,
    structuredData,
    showBoundingBoxes,
    highlightedItem,
    rotation,
    drawBoundingBoxes,
  ]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove]);

  // ★ 高速化された一括処理関数 ★
  const handleBatchProcess = async () => {
    if (fileQueue.length === 0) {
      alert("ファイルが選択されていません");
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);
    setIsProcessingQueue(true);
    setIsCancelling(false);
    showMessage("🚀 高速並列処理を開始します...", "success");

    const tempStructuredData = {};
    const tempOcrTexts = {};
    const tempOcrElements = {};
    let processedCount = 0;

    try {
      // バッチ処理：3つずつ並列処理（速度改善）
      const batchSize = 3;
      for (let i = 0; i < fileQueue.length; i += batchSize) {
        const batch = fileQueue.slice(
          i,
          Math.min(i + batchSize, fileQueue.length)
        );

        const batchPromises = batch.map(async (file, batchIndex) => {
          const globalIndex = i + batchIndex;

          try {
            if (controller.signal.aborted) {
              throw new Error("CANCELLED");
            }

            // 画像圧縮（高速化）
            const compressedImage = await compressImage(file.file, 800, 0.7);
            const base64Image = compressedImage.split(",")[1];

            // OCR実行
            const apiKey = process.env.REACT_APP_VISION_API_KEY;
            const ocrResponse = await fetch(
              `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  requests: [
                    {
                      image: { content: base64Image },
                      features: [{ type: "TEXT_DETECTION" }],
                    },
                  ],
                }),
                signal: controller.signal,
              }
            );

            if (controller.signal.aborted) {
              throw new Error("CANCELLED");
            }

            const ocrData = await ocrResponse.json();
            const textAnnotations = ocrData.responses[0].textAnnotations || [];
            const ocrTextResult =
              textAnnotations[0]?.description || "文字が検出されませんでした";
            tempOcrTexts[globalIndex] = ocrTextResult;

            // OCR要素を保存
            const ocrElementsWithId = textAnnotations
              .slice(1)
              .map((annotation, index) => ({
                id: index,
                description: annotation.description,
                boundingPoly: annotation.boundingPoly,
              }));
            tempOcrElements[globalIndex] = ocrElementsWithId;

            // 構造化実行（画像付き）
            const simplifiedOcrData = ocrElementsWithId.map((el) => ({
              id: el.id,
              description: el.description,
            }));

            const openaiKey = process.env.REACT_APP_OPENAI_API_KEY;
            const structureResponse = await fetch(
              "https://api.openai.com/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${openaiKey}`,
                },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    {
                      role: "user",
                      content: [
                        {
                          type: "text",
                          text: `レシートから情報を抽出してJSON形式で返してください。
OCRデータ：${JSON.stringify(simplifiedOcrData, null, 2)}

形式：
{
  "店名": {"value": "屋号のみ", "ids": [関連するID]},
  "日付": {"value": "YYYY年MM月DD日", "ids": [関連するID]},
  "合計金額": {"value": 数字, "ids": [関連するID]},
  "消費税額": {"value": 数字, "ids": [関連するID]},
  "品目": {"value": ["商品名1"], "ids": [関連するID]},
  "支払方法": {"value": "...", "ids": [関連するID]},
  "勘定科目提案": {"value": ["科目1", "科目2", "科目3"], "ids": [関連するID]}
}`,
                        },
                        {
                          type: "image_url",
                          image_url: {
                            url: `data:image/jpeg;base64,${base64Image}`,
                          },
                        },
                      ],
                    },
                  ],
                  temperature: 0,
                  max_tokens: 2000,
                }),
                signal: controller.signal,
              }
            );

            if (controller.signal.aborted) {
              throw new Error("CANCELLED");
            }

            const structureData = await structureResponse.json();
            const result = structureData.choices[0].message.content;
            const jsonMatch = result.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
              const structuredDataWithIds = JSON.parse(jsonMatch[0]);

              // バウンディングボックスを再構成
              const finalResult = reconstructBoundingPolys(
                structuredDataWithIds,
                ocrElementsWithId
              );

              tempStructuredData[globalIndex] = finalResult;
            }

            processedCount++;

            setMessage({
              show: true,
              text: `⚡ 高速処理: ${processedCount}/${
                fileQueue.length
              } (${Math.round((processedCount / fileQueue.length) * 100)}%)`,
              type: "success",
            });

            return { success: true, index: globalIndex };
          } catch (error) {
            if (error.message === "CANCELLED") {
              throw error;
            }

            console.error(`ファイル ${globalIndex + 1} の処理エラー:`, error);
            processedCount++;

            return { success: false, index: globalIndex, error };
          }
        });

        await Promise.all(batchPromises);
      }

      // 処理完了
      setAllStructuredData(tempStructuredData);
      setAllOcrTexts(tempOcrTexts);
      setAllOcrElements(tempOcrElements);

      // 最初のファイルを表示
      if (tempStructuredData[0]) {
        setStructuredData(tempStructuredData[0]);
        setOcrText("構造化完了");
        setOcrElements(tempOcrElements[0] || []);

        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const compressed = await compressImage(fileQueue[0].file, 800, 0.7);
            setImage(compressed);
          } catch (e) {
            setImage(event.target.result);
          }
        };
        reader.readAsDataURL(fileQueue[0].file);
      }

      const successCount = Object.keys(tempStructuredData).length;
      showMessage(
        `🎉 高速処理完了！${successCount}/${fileQueue.length}件を処理しました`,
        "success"
      );
    } catch (error) {
      if (error.message === "CANCELLED") {
        showMessage(
          `🛑 処理をキャンセルしました（${processedCount}/${fileQueue.length}件が処理済み）`,
          "warning"
        );

        if (Object.keys(tempStructuredData).length > 0) {
          setAllStructuredData(tempStructuredData);
          setAllOcrTexts(tempOcrTexts);
          setAllOcrElements(tempOcrElements);

          if (tempStructuredData[0]) {
            setStructuredData(tempStructuredData[0]);
            setOcrText("構造化完了");
            setOcrElements(tempOcrElements[0] || []);

            const reader = new FileReader();
            reader.onload = async (event) => {
              try {
                const compressed = await compressImage(
                  fileQueue[0].file,
                  800,
                  0.7
                );
                setImage(compressed);
              } catch (e) {
                setImage(event.target.result);
              }
            };
            reader.readAsDataURL(fileQueue[0].file);
          }
        }
      } else {
        console.error("並列処理エラー:", error);
        showMessage("⚠️ 並列処理中にエラーが発生しました", "error");
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
        <div className={`message message-${message.type}`}>{message.text}</div>
      )}

      <div className="main-layout">
        {/* 左列：レシート一覧 */}
        <div className="receipt-list-section">
          <div
            style={{
              background: "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)",
              color: "#495057",
              padding: "12px",
              borderBottom: "1px solid #dee2e6",
            }}
          >
            <h3 style={{ margin: "0", fontSize: "0.9rem" }}>
              📋 表示中:{" "}
              {fileQueue.length > 0
                ? `${currentFileIndex + 1}/${fileQueue.length} ファイル`
                : "0件"}
            </h3>
          </div>

          {/* 画像選択ボタン */}
          <div style={{ padding: "10px" }}>
            <label
              htmlFor="file-input"
              className="btn btn-select"
              style={{ display: "block", textAlign: "center", width: "100%" }}
            >
              {fileQueue.length > 0 ? "画像を追加" : "画像選択"}
            </label>
            <input
              type="file"
              id="file-input"
              accept="image/*"
              onChange={handleChange}
              style={{ display: "none" }}
              multiple
            />

            {fileQueue.length > 0 && (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      "すべてのファイルと処理データをクリアして、新しく始めますか？"
                    )
                  ) {
                    setFileQueue([]);
                    setCurrentFileIndex(0);
                    setImage(null);
                    setOcrText("");
                    setStructuredData(null);
                    setAllStructuredData({});
                    setAllOcrTexts({});
                    setAllOcrElements({});
                    setProcessedFiles([]);
                    setFileName("");
                    setFileSize("");
                    setIsEditing(false);
                    setEditedData(null);
                    setRotation(0);
                    showMessage("すべてのデータをクリアしました", "success");
                  }
                }}
                style={{
                  width: "100%",
                  marginTop: "8px",
                  padding: "10px",
                  background:
                    "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  boxShadow: "0 4px 15px rgba(239, 68, 68, 0.3)",
                  transition: "all 0.3s ease",
                }}
              >
                🗑️ すべてクリア
              </button>
            )}
          </div>

          {/* 全ファイル構造化ボタン */}
          {fileQueue.length > 0 && (
            <div style={{ padding: "0 10px 10px" }}>
              {!isProcessingQueue ? (
                <button
                  onClick={handleBatchProcess}
                  style={{
                    width: "100%",
                    padding: "16px 20px",
                    background:
                      "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    color: "white",
                    border: "none",
                    borderRadius: "16px",
                    fontSize: "14px",
                    fontWeight: "600",
                    letterSpacing: "0.025em",
                    cursor: "pointer",
                    boxShadow: "0 8px 25px rgba(99, 102, 241, 0.3)",
                    transition: "all 0.3s ease",
                    fontFamily:
                      "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                  }}
                >
                  ⚡ 全ファイルを高速構造化
                </button>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                  }}
                >
                  <button
                    style={{
                      width: "100%",
                      padding: "16px 20px",
                      background:
                        "linear-gradient(135deg, #64748b 0%, #475569 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: "16px",
                      fontSize: "14px",
                      fontWeight: "600",
                      letterSpacing: "0.025em",
                      cursor: "not-allowed",
                      boxShadow: "0 4px 15px rgba(100, 116, 139, 0.2)",
                      fontFamily:
                        "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                    disabled
                  >
                    {isCancelling ? "🛑 キャンセル中..." : "⏳ 処理中..."}
                  </button>

                  {!isCancelling && (
                    <button
                      onClick={handleCancelBatch}
                      style={{
                        width: "100%",
                        padding: "12px 20px",
                        background:
                          "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                        color: "white",
                        border: "none",
                        borderRadius: "12px",
                        fontSize: "13px",
                        fontWeight: "600",
                        letterSpacing: "0.025em",
                        cursor: "pointer",
                        boxShadow: "0 6px 20px rgba(220, 38, 38, 0.3)",
                        transition: "all 0.3s ease",
                        fontFamily:
                          "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
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
            <div style={{ padding: "0 10px 10px" }}>
              <div
                style={{ fontSize: "13px", color: "#666", marginBottom: "5px" }}
              >
                ステータスで絞り込み：
              </div>
              <div style={{ display: "flex", gap: "5px" }}>
                <button
                  onClick={() => setFilterStatus("all")}
                  style={{
                    flex: 1,
                    padding: "5px",
                    fontSize: "14px",
                    border: "none",
                    borderRadius: "12px",
                    background: filterStatus === "all" ? "#667eea" : "#e0e0e0",
                    color: filterStatus === "all" ? "white" : "#666",
                    cursor: "pointer",
                  }}
                >
                  全て
                </button>
                <button
                  onClick={() => setFilterStatus("unprocessed")}
                  style={{
                    flex: 1,
                    padding: "5px",
                    fontSize: "13px",
                    border: "none",
                    borderRadius: "12px",
                    background:
                      filterStatus === "unprocessed" ? "#9E9E9E" : "#e0e0e0",
                    color: filterStatus === "unprocessed" ? "white" : "#666",
                    cursor: "pointer",
                  }}
                >
                  未処理
                </button>
                <button
                  onClick={() => setFilterStatus("draft")}
                  style={{
                    flex: 1,
                    padding: "5px",
                    fontSize: "13px",
                    border: "none",
                    borderRadius: "12px",
                    background:
                      filterStatus === "draft" ? "#FFC107" : "#e0e0e0",
                    color: filterStatus === "draft" ? "white" : "#666",
                    cursor: "pointer",
                  }}
                >
                  AI下書き
                </button>
                <button
                  onClick={() => setFilterStatus("confirmed")}
                  style={{
                    flex: 1,
                    padding: "5px",
                    fontSize: "13px",
                    border: "none",
                    borderRadius: "12px",
                    background:
                      filterStatus === "confirmed" ? "#4CAF50" : "#e0e0e0",
                    color: filterStatus === "confirmed" ? "white" : "#666",
                    cursor: "pointer",
                  }}
                >
                  確定済
                </button>
              </div>
            </div>
          )}

          {/* レシート一覧 */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "0 10px",
            }}
          >
            {fileQueue.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "30px",
                  color: "#999",
                }}
              >
                <p style={{ fontSize: "12px" }}>
                  レシート画像を
                  <br />
                  選択してください
                </p>
              </div>
            ) : (
              fileQueue
                .map((file, index) => {
                  let status = "unprocessed";
                  if (processedFiles.includes(index)) {
                    status = "confirmed";
                  } else if (allStructuredData[index]) {
                    status = "draft";
                  }

                  if (filterStatus !== "all" && status !== filterStatus) {
                    return null;
                  }

                  return (
                    <div
                      key={file.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "8px",
                        marginBottom: "6px",
                        background:
                          index === currentFileIndex
                            ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                            : "white",
                        border: "1px solid",
                        borderColor:
                          index === currentFileIndex ? "#667eea" : "#e0e0e0",
                        borderRadius: "8px",
                        cursor: "pointer",
                        position: "relative",
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(index);
                        }}
                        style={{
                          position: "absolute",
                          top: "4px",
                          right: "4px",
                          width: "24px",
                          height: "24px",
                          background:
                            index === currentFileIndex
                              ? "rgba(255, 255, 255, 0.2)"
                              : "rgba(239, 68, 68, 0.1)",
                          border: "none",
                          borderRadius: "50%",
                          color:
                            index === currentFileIndex ? "white" : "#ef4444",
                          fontSize: "14px",
                          fontWeight: "bold",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.2s ease",
                          zIndex: 10,
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background =
                            index === currentFileIndex
                              ? "rgba(255, 255, 255, 0.3)"
                              : "rgba(239, 68, 68, 0.2)";
                          e.target.style.transform = "scale(1.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background =
                            index === currentFileIndex
                              ? "rgba(255, 255, 255, 0.2)"
                              : "rgba(239, 68, 68, 0.1)";
                          e.target.style.transform = "scale(1)";
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

                          const reader = new FileReader();
                          reader.onload = async (event) => {
                            try {
                              const compressed = await compressImage(
                                selectedFile,
                                800,
                                0.7
                              );
                              setImage(compressed);
                            } catch (e) {
                              setImage(event.target.result);
                            }

                            if (allStructuredData && allStructuredData[index]) {
                              setStructuredData(allStructuredData[index]);
                              setOcrText("構造化完了");
                              setOcrElements(allOcrElements[index] || []);
                            } else {
                              setOcrText("");
                              setStructuredData(null);
                              setOcrElements([]);
                            }
                          };
                          reader.readAsDataURL(selectedFile);
                          setIsEditing(false);
                          setRotation(0);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          width: "100%",
                        }}
                      >
                        <img
                          src={file.preview}
                          alt="サムネイル"
                          style={{
                            width: "60px",
                            height: "60px",
                            objectFit: "cover",
                            borderRadius: "4px",
                            marginRight: "8px",
                          }}
                        />

                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: "15px",
                              fontWeight: "bold",
                              color:
                                index === currentFileIndex ? "white" : "#333",
                            }}
                          >
                            {allStructuredData[index]?.店名?.value ||
                              file.name.substring(0, 10)}
                          </div>
                          <div
                            style={{
                              fontSize: "14px",
                              color:
                                index === currentFileIndex ? "#f0f0f0" : "#666",
                            }}
                          >
                            {allStructuredData[index]?.日付?.value || "---"}
                          </div>
                          <div
                            style={{
                              fontSize: "14px",
                              color:
                                index === currentFileIndex ? "#f0f0f0" : "#666",
                            }}
                          >
                            {allStructuredData[index]
                              ? `¥${
                                  allStructuredData[
                                    index
                                  ].合計金額?.value?.toLocaleString() || "---"
                                }`
                              : ""}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: "15px",
                            color:
                              index === currentFileIndex
                                ? "#f0f0f0"
                                : status === "confirmed"
                                ? "#4CAF50"
                                : status === "draft"
                                ? "#FFC107"
                                : "#9E9E9E",
                            fontWeight: "bold",
                            marginRight: "8px",
                          }}
                        >
                          {status === "confirmed"
                            ? "✅確定済"
                            : status === "draft"
                            ? "📝AI 下書き済"
                            : "未処理"}
                        </div>
                      </div>
                    </div>
                  );
                })
                .filter(Boolean)
            )}
          </div>
        </div>

        {/* 中央列：プレビュー */}
        {/* 中央列：プレビュー */}
        <div className="center-section">
          <div
            style={{
              marginBottom: "10px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "14px", color: "#666" }}>
              {fileName ? `ファイル: ${fileName}` : ""}
            </span>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {/* ★★ ズーム表示（新規追加） ★★ */}
              {image && (
                <span
                  style={{
                    fontSize: "12px",
                    color: "#666",
                    fontWeight: "600",
                    padding: "4px 8px",
                    background: "rgba(0,0,0,0.05)",
                    borderRadius: "4px",
                  }}
                >
                  🔍 {Math.round(zoomLevel * 100)}%
                </span>
              )}

              {/* ★★ ズームボタン（新規追加） ★★ */}
              {image && (
                <>
                  <button
                    onClick={() => handleZoom(-0.2)} // mouseX, mouseYを指定しない = デフォルト位置
                    style={{
                      padding: "8px 12px",
                      background:
                        "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) =>
                      (e.target.style.transform = "scale(1.05)")
                    }
                    onMouseLeave={(e) =>
                      (e.target.style.transform = "scale(1)")
                    }
                  >
                    ➖
                  </button>
                  <button
                    onClick={() => handleZoom(0.2)} // mouseX, mouseYを指定しない = デフォルト位置
                    style={{
                      padding: "8px 12px",
                      background:
                        "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) =>
                      (e.target.style.transform = "scale(1.05)")
                    }
                    onMouseLeave={(e) =>
                      (e.target.style.transform = "scale(1)")
                    }
                  >
                    ➕
                  </button>
                  <button
                    onClick={resetZoom}
                    style={{
                      padding: "8px 16px",
                      background:
                        "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) =>
                      (e.target.style.transform = "scale(1.05)")
                    }
                    onMouseLeave={(e) =>
                      (e.target.style.transform = "scale(1)")
                    }
                  >
                    🔄 原寸
                  </button>
                </>
              )}
              {/* 回転ボタン（新規追加） */}
              {image && (
                <button
                  onClick={handleRotate}
                  style={{
                    padding: "8px 16px",
                    background:
                      "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  🔄 回転 ({rotation}°)
                </button>
              )}

              {structuredData && (
                <button
                  onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                  style={{
                    padding: "8px 16px",
                    background: showBoundingBoxes
                      ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                      : "linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  {showBoundingBoxes ? "📦 BBox: ON" : "📦 BBox: OFF"}
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "linear-gradient(135deg, #ffecd2 0%, #fcb69f 20%, #ffecd2 100%)",
              borderRadius: "12px",
              overflow: "hidden",
              position: "relative",
              minHeight: "400px",
              maxHeight: "80vh",
            }}
          >
            {image ? (
              <canvas
                ref={canvasRef}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  cursor:
                    zoomLevel > 1 && isDragging
                      ? "grabbing"
                      : zoomLevel > 1
                      ? "grab"
                      : "pointer",
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onClick={handleCanvasClick}
              />
            ) : (
              <div style={{ textAlign: "center", color: "#999" }}>
                画像を選択してください
              </div>
            )}
          </div>
        </div>

        {/* 右列：データと操作 */}
        <div className="right-section">
          <div className="btn-group">
            <button
              className="btn btn-ocr"
              onClick={handleOCR}
              disabled={!image || isLoading}
              style={{
                padding: "16px 24px",
                background:
                  !image || isLoading
                    ? "linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)"
                    : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "white",
                border: "none",
                borderRadius: "16px",
                fontSize: "14px",
                fontWeight: "600",
                letterSpacing: "0.025em",
                cursor: !image || isLoading ? "not-allowed" : "pointer",
                boxShadow:
                  !image || isLoading
                    ? "0 4px 15px rgba(156, 163, 175, 0.2)"
                    : "0 8px 25px rgba(16, 185, 129, 0.3)",
                transition: "all 0.3s ease",
                fontFamily:
                  "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                width: "100%",
              }}
            >
              {isLoading && ocrText === "処理中..." ? (
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <div className="loading-dots">
                    <div></div>
                    <div></div>
                    <div></div>
                  </div>
                  📄 読み取り中...
                </div>
              ) : (
                "OCR実行"
              )}
            </button>

            <button
              className="btn btn-structure"
              onClick={handleStructure}
              disabled={!ocrText || isLoading || ocrText === "処理中..."}
              style={{
                padding: "16px 24px",
                background:
                  !ocrText || isLoading || ocrText === "処理中..."
                    ? "linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)"
                    : "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)",
                color: "white",
                border: "none",
                borderRadius: "16px",
                fontSize: "14px",
                fontWeight: "600",
                letterSpacing: "0.025em",
                cursor:
                  !ocrText || isLoading || ocrText === "処理中..."
                    ? "not-allowed"
                    : "pointer",
                boxShadow:
                  !ocrText || isLoading || ocrText === "処理中..."
                    ? "0 4px 15px rgba(156, 163, 175, 0.2)"
                    : "0 8px 25px rgba(14, 165, 233, 0.3)",
                transition: "all 0.3s ease",
                fontFamily:
                  "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                width: "100%",
              }}
            >
              {isLoading && ocrText === "OpenAIで構造化中..." ? (
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <div className="loading-dots">
                    <div></div>
                    <div></div>
                    <div></div>
                  </div>
                  🤖 AI解析中...
                </div>
              ) : (
                "AI解析"
              )}
            </button>

            <button
              className="btn btn-save"
              onClick={handleSave}
              disabled={!structuredData || isLoading}
              style={{
                padding: "16px 24px",
                background:
                  !structuredData || isLoading
                    ? "linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)"
                    : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                color: "white",
                border: "none",
                borderRadius: "16px",
                fontSize: "14px",
                fontWeight: "600",
                letterSpacing: "0.025em",
                cursor:
                  !structuredData || isLoading ? "not-allowed" : "pointer",
                boxShadow:
                  !structuredData || isLoading
                    ? "0 4px 15px rgba(156, 163, 175, 0.2)"
                    : "0 8px 25px rgba(245, 158, 11, 0.3)",
                transition: "all 0.3s ease",
                fontFamily:
                  "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                width: "100%",
              }}
            >
              {isLoading && structuredData ? (
                <>
                  <span className="loading-spinner"></span>保存中...
                </>
              ) : (
                "確定"
              )}
            </button>
          </div>

          {fileQueue.length > 1 && structuredData && (
            <button
              onClick={() => {
                const nextIndex = (currentFileIndex + 1) % fileQueue.length;
                setCurrentFileIndex(nextIndex);

                const nextFile = fileQueue[nextIndex].file;
                setFileName(nextFile.name);
                setFileSize(formatFileSize(nextFile.size));

                const reader = new FileReader();
                reader.onload = async (event) => {
                  try {
                    const compressed = await compressImage(nextFile, 800, 0.7);
                    setImage(compressed);
                  } catch (e) {
                    setImage(event.target.result);
                  }

                  if (allStructuredData && allStructuredData[nextIndex]) {
                    setStructuredData(allStructuredData[nextIndex]);
                    setOcrText("構造化完了");
                    setOcrElements(allOcrElements[nextIndex] || []);
                  } else {
                    setOcrText("");
                    setStructuredData(null);
                    setOcrElements([]);
                  }
                };
                reader.readAsDataURL(nextFile);
                setIsEditing(false);
                setRotation(0);
              }}
              style={{
                width: "100%",
                padding: "16px 24px",
                marginTop: "16px",
                background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
                color: "white",
                border: "none",
                borderRadius: "16px",
                fontSize: "14px",
                fontWeight: "600",
                letterSpacing: "0.025em",
                cursor: "pointer",
                boxShadow: "0 8px 25px rgba(124, 58, 237, 0.3)",
                transition: "all 0.3s ease",
                fontFamily:
                  "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              次のファイルへ →
            </button>
          )}

          <div
            className={`preview-area right-preview ${
              ocrText || structuredData ? "has-content" : ""
            }`}
            style={{ marginTop: fileQueue.length > 0 ? " 15px" : "0" }}
          >
            {!ocrText && !structuredData && (
              <div className="preview-placeholder">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
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
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  padding: "15px",
                  background: "white",
                  borderRadius: "12px",
                  boxShadow: "0 5px 20px rgba(0, 0, 0, 0.1)",
                  fontFamily: "'Courier New', monospace",
                  fontSize: "0.9rem",
                  lineHeight: "1.5",
                  overflowY: "auto",
                }}
              >
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                  {ocrText}
                </pre>
              </div>
            )}

            {structuredData && (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  padding: "15px",
                  paddingTop: "60px",
                  background: "white",
                  borderRadius: "12px",
                  boxShadow: "0 5px 20px rgba(0, 0, 0, 0.1)",
                  overflowY: "auto",
                  position: "relative",
                }}
              >
                {!isEditing && (
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      // ★ .valueの値を抽出して編集用データを作成 ★
                      const editData = {};
                      for (const key in structuredData) {
                        editData[key] = structuredData[key]?.value ?? null;
                      }
                      setEditedData(editData);
                    }}
                    style={{
                      position: "absolute",
                      top: "15px",
                      right: "15px",
                      padding: "8px 16px",
                      background:
                        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      fontWeight: "bold",
                      cursor: "pointer",
                      boxShadow: "0 2px 8px rgba(102, 126, 234, 0.3)",
                      transition: "all 0.3s ease",
                    }}
                  >
                    ✏️ 編集
                  </button>
                )}

                {/* 表示モード */}
                {!isEditing && (
                  <>
                    {Object.entries({
                      店名: structuredData.店名?.value,
                      日付: structuredData.日付?.value,
                      合計金額: structuredData.合計金額?.value
                        ? `¥${structuredData.合計金額.value.toLocaleString()}`
                        : null,
                      消費税額: structuredData.消費税額?.value
                        ? `¥${structuredData.消費税額.value.toLocaleString()}`
                        : null,
                      支払方法: structuredData.支払方法?.value,
                    }).map(
                      ([label, value]) =>
                        value !== null &&
                        value !== undefined && (
                          <div
                            key={label}
                            data-field-name={label}
                            className="result-item"
                            onClick={() => setHighlightedItem(label)} // ★ onClickを追加
                            onMouseEnter={() => setHighlightedItem(label)}
                            onMouseLeave={() => setHighlightedItem(null)}
                            style={{
                              cursor: "pointer",
                              background:
                                highlightedItem === label
                                  ? "#e0f2fe"
                                  : "transparent",
                              padding: "12px", // ★ パディングを増やす
                              marginBottom: "10px", // ★ マージンを増やす
                              borderRadius: "8px",
                              transition: "all 0.2s",
                              border:
                                highlightedItem === label
                                  ? "2px solid #0ea5e9"
                                  : "2px solid transparent",
                              transform:
                                highlightedItem === label
                                  ? "scale(1.02)"
                                  : "scale(1)",
                              boxShadow:
                                highlightedItem === label
                                  ? "0 4px 12px rgba(14, 165, 233, 0.2)"
                                  : "none",
                              userSelect: "none", // ★ テキスト選択を無効化
                              WebkitTapHighlightColor: "transparent", // ★ モバイルのタップハイライトを無効化
                              // ★ ホバーエフェクトを追加
                              "&:hover": {
                                background: "#f0f9ff",
                              },
                            }}
                          >
                            {/* ★ クリック可能エリアを全体に拡大 */}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                width: "100%",
                              }}
                            >
                              <span
                                className="result-label"
                                style={{
                                  fontWeight: "600",
                                  color:
                                    highlightedItem === label
                                      ? "#0ea5e9"
                                      : "#6b7280",
                                  marginRight: "12px",
                                }}
                              >
                                {label}:
                              </span>
                              <span
                                className="result-value"
                                style={{
                                  color:
                                    highlightedItem === label
                                      ? "#0c4a6e"
                                      : "#111827",
                                  fontWeight:
                                    highlightedItem === label ? "600" : "400",
                                }}
                              >
                                {value}
                              </span>
                            </div>
                          </div>
                        )
                    )}

                    {/* 品目の改善版（クリック可能エリア拡大） */}
                    {structuredData.品目?.value && (
                      <div
                        data-field-name="品目"
                        className="result-item"
                        onClick={() => setHighlightedItem("品目")} // ★ onClickを追加
                        onMouseEnter={() => setHighlightedItem("品目")}
                        onMouseLeave={() => setHighlightedItem(null)}
                        style={{
                          cursor: "pointer",
                          background:
                            highlightedItem === "品目"
                              ? "#e0f2fe"
                              : "transparent",
                          padding: "12px", // ★ パディングを増やす
                          marginBottom: "10px",
                          borderRadius: "8px",
                          transition: "all 0.2s",
                          border:
                            highlightedItem === "品目"
                              ? "2px solid #0ea5e9"
                              : "2px solid transparent",
                          transform:
                            highlightedItem === "品目"
                              ? "scale(1.02)"
                              : "scale(1)",
                          boxShadow:
                            highlightedItem === "品目"
                              ? "0 4px 12px rgba(14, 165, 233, 0.2)"
                              : "none",
                          userSelect: "none",
                          WebkitTapHighlightColor: "transparent",
                        }}
                      >
                        <span
                          className="result-label"
                          style={{
                            fontWeight: "600",
                            color:
                              highlightedItem === "品目"
                                ? "#0ea5e9"
                                : "#6b7280",
                            display: "block",
                            marginBottom: "8px",
                          }}
                        >
                          品目:
                        </span>
                        <div style={{ paddingLeft: "12px" }}>
                          {structuredData.品目.value.map((item, i) => (
                            <div
                              key={i}
                              style={{
                                padding: "4px 0",
                                color:
                                  highlightedItem === "品目"
                                    ? "#0c4a6e"
                                    : "#374151",
                              }}
                            >
                              ・{item}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/*  勘定科目提案の改善版（同様に改善） */}
                    {structuredData.勘定科目提案?.value && (
                      <div
                        data-field-name="勘定科目提案"
                        className="result-item"
                        onClick={() => setHighlightedItem("勘定科目提案")} // ★ onClickを追加
                        onMouseEnter={() => setHighlightedItem("勘定科目提案")}
                        onMouseLeave={() => setHighlightedItem(null)}
                        style={{
                          cursor: "pointer",
                          background:
                            highlightedItem === "勘定科目提案"
                              ? "#e0f2fe"
                              : "transparent",
                          padding: "12px",
                          marginBottom: "10px",
                          borderRadius: "8px",
                          transition: "all 0.2s",
                          border:
                            highlightedItem === "勘定科目提案"
                              ? "2px solid #0ea5e9"
                              : "2px solid transparent",
                          transform:
                            highlightedItem === "勘定科目提案"
                              ? "scale(1.02)"
                              : "scale(1)",
                          boxShadow:
                            highlightedItem === "勘定科目提案"
                              ? "0 4px 12px rgba(14, 165, 233, 0.2)"
                              : "none",
                          userSelect: "none",
                          WebkitTapHighlightColor: "transparent",
                        }}
                      >
                        <span
                          className="result-label"
                          style={{
                            fontWeight: "600",
                            color:
                              highlightedItem === "勘定科目提案"
                                ? "#0ea5e9"
                                : "#6b7280",
                            display: "block",
                            marginBottom: "8px",
                          }}
                        >
                          勘定科目提案:
                        </span>
                        <div style={{ paddingLeft: "12px" }}>
                          {structuredData.勘定科目提案.value.map((item, i) => (
                            <div
                              key={i}
                              style={{
                                padding: "4px 0",
                                color:
                                  highlightedItem === "勘定科目提案"
                                    ? "#0c4a6e"
                                    : "#374151",
                              }}
                            >
                              {i + 1}. {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {/* 編集モード */}
                {isEditing && editedData && (
                  <>
                    <h3
                      style={{
                        margin: "0 0 20px 0",
                        fontSize: "1.1rem",
                        color: "#5E35B1",
                      }}
                    >
                      📝 データを編集
                    </h3>

                    {["店名", "日付", "支払方法"].map((field) => (
                      <div key={field} style={{ marginBottom: "15px" }}>
                        <label
                          style={{
                            display: "block",
                            fontWeight: "bold",
                            marginBottom: "5px",
                            color: "#495057",
                          }}
                        >
                          {field}:
                        </label>
                        <input
                          type="text"
                          value={editedData[field] || ""}
                          onChange={(e) =>
                            setEditedData({
                              ...editedData,
                              [field]: e.target.value,
                            })
                          }
                          style={{
                            width: "100%",
                            padding: "10px",
                            border: "2px solid #e0e0e0",
                            borderRadius: "8px",
                            fontSize: "1rem",
                            transition: "border-color 0.3s",
                            outline: "none",
                          }}
                          onFocus={(e) =>
                            (e.target.style.borderColor = "#667eea")
                          }
                          onBlur={(e) =>
                            (e.target.style.borderColor = "#e0e0e0")
                          }
                        />
                      </div>
                    ))}

                    {["合計金額", "消費税額"].map((field) => (
                      <div key={field} style={{ marginBottom: "15px" }}>
                        <label
                          style={{
                            display: "block",
                            fontWeight: "bold",
                            marginBottom: "5px",
                            color: "#495057",
                          }}
                        >
                          {field}:
                        </label>
                        <input
                          type="number"
                          value={editedData[field] || ""}
                          onChange={(e) =>
                            setEditedData({
                              ...editedData,
                              [field]: parseInt(e.target.value) || 0,
                            })
                          }
                          style={{
                            width: "100%",
                            padding: "10px",
                            border: "2px solid #e0e0e0",
                            borderRadius: "8px",
                            fontSize: "1rem",
                            transition: "border-color 0.3s",
                            outline: "none",
                          }}
                          onFocus={(e) =>
                            (e.target.style.borderColor = "#667eea")
                          }
                          onBlur={(e) =>
                            (e.target.style.borderColor = "#e0e0e0")
                          }
                        />
                      </div>
                    ))}

                    <div style={{ marginBottom: "15px" }}>
                      <label
                        style={{
                          display: "block",
                          fontWeight: "bold",
                          marginBottom: "5px",
                          color: "#495057",
                        }}
                      >
                        品目:
                      </label>
                      <textarea
                        value={
                          editedData.品目
                            ? typeof editedData.品目 === "string"
                              ? editedData.品目
                              : editedData.品目.join("\n")
                            : ""
                        }
                        onChange={(e) =>
                          setEditedData({
                            ...editedData,
                            品目: e.target.value
                              .split("\n")
                              .filter((item) => item.trim()),
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "10px",
                          border: "2px solid #e0e0e0",
                          borderRadius: "8px",
                          fontSize: "1rem",
                          minHeight: "80px",
                          transition: "border-color 0.3s",
                          outline: "none",
                          resize: "vertical",
                        }}
                        onFocus={(e) =>
                          (e.target.style.borderColor = "#667eea")
                        }
                        onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
                        placeholder="例：商品名1&#10;商品名2"
                      />
                    </div>

                    <div style={{ marginBottom: "20px" }}>
                      <label
                        style={{
                          display: "block",
                          fontWeight: "bold",
                          marginBottom: "5px",
                          color: "#495057",
                        }}
                      >
                        勘定科目提案:
                      </label>
                      <textarea
                        value={
                          editedData.勘定科目提案
                            ? typeof editedData.勘定科目提案 === "string"
                              ? editedData.勘定科目提案
                              : editedData.勘定科目提案.join("\n")
                            : ""
                        }
                        onChange={(e) =>
                          setEditedData({
                            ...editedData,
                            勘定科目提案: e.target.value
                              .split("\n")
                              .filter((item) => item.trim()),
                          })
                        }
                        style={{
                          width: "100%",
                          padding: "10px",
                          border: "2px solid #e0e0e0",
                          borderRadius: "8px",
                          fontSize: "1rem",
                          minHeight: "60px",
                          transition: "border-color 0.3s",
                          outline: "none",
                          resize: "vertical",
                        }}
                        onFocus={(e) =>
                          (e.target.style.borderColor = "#667eea")
                        }
                        onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
                        placeholder="例：文房具費&#10;消耗品費&#10;雑費"
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        marginTop: "20px",
                      }}
                    >
                      <button
                        onClick={async () => {
                          // ★ 編集データを.value形式に戻す ★
                          const formattedData = {};
                          for (const key in editedData) {
                            formattedData[key] = {
                              value: editedData[key],
                              boundingPoly:
                                structuredData[key]?.boundingPoly || null,
                            };
                          }

                          setStructuredData(formattedData);
                          setIsEditing(false);

                          const updatedAllData = { ...allStructuredData };
                          updatedAllData[currentFileIndex] = formattedData;
                          setAllStructuredData(updatedAllData);

                          const newProcessedFiles = [
                            ...processedFiles,
                            currentFileIndex,
                          ];
                          setProcessedFiles(newProcessedFiles);

                          const gasUrl = process.env.REACT_APP_GAS_URL;
                          const fd = new FormData();
                          fd.append("payload", JSON.stringify(editedData));

                          try {
                            await fetch(gasUrl, {
                              method: "POST",
                              mode: "no-cors",
                              body: fd,
                            });
                            showMessage(
                              `${
                                currentFileIndex + 1
                              }番目のデータを保存しました！`,
                              "success"
                            );

                            const allDone = fileQueue.every((_, idx) =>
                              newProcessedFiles.includes(idx)
                            );

                            if (!allDone) {
                              const unprocessedIndex = fileQueue.findIndex(
                                (_, idx) => !newProcessedFiles.includes(idx)
                              );

                              if (unprocessedIndex !== -1) {
                                setCurrentFileIndex(unprocessedIndex);

                                const nextFile =
                                  fileQueue[unprocessedIndex].file;
                                setFileName(
                                  nextFile.name.length > 20
                                    ? nextFile.name.substring(0, 17) + "..."
                                    : nextFile.name
                                );
                                setFileSize(formatFileSize(nextFile.size));

                                const reader = new FileReader();
                                reader.onload = async (event) => {
                                  try {
                                    const compressed = await compressImage(
                                      nextFile,
                                      800,
                                      0.7
                                    );
                                    setImage(compressed);
                                  } catch (e) {
                                    setImage(event.target.result);
                                  }
                                };
                                reader.readAsDataURL(nextFile);

                                if (allStructuredData[unprocessedIndex]) {
                                  setStructuredData(
                                    allStructuredData[unprocessedIndex]
                                  );
                                  setOcrText("構造化完了");
                                  setOcrElements(
                                    allOcrElements[unprocessedIndex] || []
                                  );
                                } else {
                                  setOcrText("");
                                  setStructuredData(null);
                                  setOcrElements([]);
                                }

                                setRotation(0);
                                showMessage(
                                  `📝 未処理のファイル（${
                                    unprocessedIndex + 1
                                  }/${fileQueue.length}）を表示しました`,
                                  "info"
                                );
                              }
                            } else {
                              showMessage(
                                "🎉 すべてのファイルの処理が完了しました！",
                                "success"
                              );

                              setTimeout(() => {
                                if (
                                  window.confirm(
                                    "すべての処理が完了しました。新しいファイルを選択しますか？"
                                  )
                                ) {
                                  setFileQueue([]);
                                  setCurrentFileIndex(0);
                                  setImage(null);
                                  setOcrText("");
                                  setStructuredData(null);
                                  setAllStructuredData({});
                                  setAllOcrTexts({});
                                  setAllOcrElements({});
                                  setProcessedFiles([]);
                                  setFileName("");
                                  setFileSize("");
                                  setEditedData(null);
                                  setRotation(0);
                                }
                              }, 1000);
                            }
                          } catch (e) {
                            console.error("保存エラー:", e);
                            showMessage("保存に失敗しました", "error");
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: "12px 20px",
                          background:
                            "linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "1rem",
                          fontWeight: "bold",
                          cursor: "pointer",
                          boxShadow: "0 3px 10px rgba(76, 175, 80, 0.3)",
                          transition: "all 0.3s ease",
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
                          padding: "12px 20px",
                          background:
                            "linear-gradient(135deg, #9E9E9E 0%, #757575 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "1rem",
                          fontWeight: "bold",
                          cursor: "pointer",
                          boxShadow: "0 3px 10px hsla(0, 0%, 62%, 0.30)",
                          transition: "all 0.3s ease",
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
          style={{ display: "block" }}
          onClick={() => setShowModal(false)}
        >
          <img
            src={image}
            alt="拡大画像"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: "transform 0.3s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}

export default App;
