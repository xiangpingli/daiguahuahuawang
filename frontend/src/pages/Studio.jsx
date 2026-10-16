import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getArtwork, publishArtwork, updateArtwork } from "../api";
import { useAuth } from "../context/AuthContext";

const CANVAS_W = 960;
const CANVAS_H = 600;
const TEXT_LINE_HEIGHT = 1.25;
const TEXT_FONT = `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;

// 预设色板
const PALETTE = [
  "#2d3436", "#ffffff", "#d63031", "#e17055", "#fdcb6e",
  "#00b894", "#0984e3", "#6c5ce7", "#e84393", "#8d6e63",
];

// 发布审核：全图肤色像素占比超过该阈值判定疑似不当内容（与后端审核同规则）
const SKIN_RATIO_LIMIT = 0.55;

// 统计画布肤色像素占比（RGB + YCbCr 双规则，过滤纯色块误报）
function estimateSkinRatio(ctx) {
  const { data } = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  let skin = 0;
  const total = CANVAS_W * CANVAS_H;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (!(r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15)) continue;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
    if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && y > 80) skin += 1;
  }
  return skin / total;
}

// 把一个文本对象绘制到画布（多行，左上角锚点）
function drawTextObject(ctx, t) {
  if (!t.text) return;
  ctx.save();
  ctx.font = `${t.fontSize}px ${TEXT_FONT}`;
  ctx.fillStyle = t.color;
  ctx.textBaseline = "top";
  t.text.split("\n").forEach((line, i) => {
    ctx.fillText(line, t.x, t.y + i * t.fontSize * TEXT_LINE_HEIGHT);
  });
  ctx.restore();
}

// 测量文本对象包围盒
function measureTextObject(ctx, t) {
  ctx.save();
  ctx.font = `${t.fontSize}px ${TEXT_FONT}`;
  const lines = (t.text || "").split("\n");
  let w = 0;
  lines.forEach((line) => {
    w = Math.max(w, ctx.measureText(line || " ").width);
  });
  ctx.restore();
  return { w, h: lines.length * t.fontSize * TEXT_LINE_HEIGHT };
}

let textSeq = 0;

export default function Studio() {
  const canvasRef = useRef(null);       // 可见合成画布（位图 + 全部文字）
  const bitmapCanvasRef = useRef(null); // 隐藏位图层（画笔/橡皮/照片）
  const bitmapCtxRef = useRef(null);
  const ctxRef = useRef(null);          // 可见画布 ctx
  const drawingRef = useRef(false);
  const historyRef = useRef([]);        // [{bitmap, texts}] 快照栈
  const editorSnapshotRef = useRef(null); // 文本编辑打开前的快照

  const [color, setColor] = useState("#2d3436");
  const [customColor, setCustomColor] = useState("#ff7f50");
  const [size, setSize] = useState(6);
  const [tool, setTool] = useState("brush"); // brush | eraser | text
  const [fontSize, setFontSize] = useState(32);
  const [texts, setTexts] = useState([]);   // 全部文本对象
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();
  const [searchParams] = useSearchParams();
  // 编辑模式：从详情页「重画这幅画」跳转而来，发布时替换原画面
  const editId = searchParams.get("artworkId");
  const [editLoaded, setEditLoaded] = useState(false);

  const editingText = texts.find((t) => t.id === editingId) || null;

  // 合成渲染：位图层 + 全部文字
  const renderAll = () => {
    const ctx = ctxRef.current;
    const bitmap = bitmapCanvasRef.current;
    if (!ctx || !bitmap) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(bitmap, 0, 0);
    texts.forEach((t) => drawTextObject(ctx, t));
    ctx.restore();
  };

  useEffect(() => {
    // 隐藏位图层：画笔等位图操作的目标
    const bitmap = document.createElement("canvas");
    bitmap.width = CANVAS_W;
    bitmap.height = CANVAS_H;
    const bctx = bitmap.getContext("2d");
    bctx.fillStyle = "#ffffff";
    bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    bctx.lineCap = "round";
    bctx.lineJoin = "round";
    bitmapCanvasRef.current = bitmap;
    bitmapCtxRef.current = bctx;

    // 可见合成画布
    const canvas = canvasRef.current;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    ctxRef.current = canvas.getContext("2d");
    renderAll();
    historyRef.current = [{ bitmap: bitmap.toDataURL(), texts: [] }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 文字列表变化时重新合成（编辑框实时预览）
  useEffect(() => {
    renderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texts]);

  // 编辑模式：加载原画作到画板并回填标题/简介
  useEffect(() => {
    if (!editId || !isLoggedIn) return;
    let cancelled = false;
    getArtwork(editId)
      .then((art) => {
        if (cancelled) return;
        if (art.userId !== user.id) {
          setMessage("只能重画自己的画作哦");
          navigate("/studio", { replace: true });
          return;
        }
        setTitle(art.title);
        setDescription(art.description || "");
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          const bctx = bitmapCtxRef.current;
          bctx.save();
          bctx.globalCompositeOperation = "source-over";
          bctx.fillStyle = "#ffffff";
          bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          bctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
          bctx.restore();
          renderAll();
          setEditLoaded(true);
        };
        img.onerror = () => setMessage("原画作图片加载失败，刷新页面重试");
        img.src = art.image;
      })
      .catch((err) => {
        if (cancelled) return;
        setMessage(err.message);
        navigate("/studio", { replace: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, isLoggedIn]);

  const pushHistory = () => {
    const h = historyRef.current;
    if (h.length >= 30) h.shift();
    h.push({
      bitmap: bitmapCanvasRef.current.toDataURL(),
      texts: texts.map((t) => ({ ...t })),
    });
  };

  const undo = () => {
    const h = historyRef.current;
    if (h.length <= 1) return;
    h.pop();
    const snap = h[h.length - 1];
    setEditingId(null);
    const img = new Image();
    img.onload = () => {
      const bctx = bitmapCtxRef.current;
      bctx.save();
      bctx.globalCompositeOperation = "source-over";
      bctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      bctx.drawImage(img, 0, 0);
      bctx.restore();
      setTexts(snap.texts.map((t) => ({ ...t })));
    };
    img.src = snap.bitmap;
  };

  const clearCanvas = () => {
    setEditingId(null);
    pushHistory();
    const bctx = bitmapCtxRef.current;
    bctx.save();
    bctx.globalCompositeOperation = "source-over";
    bctx.fillStyle = "#ffffff";
    bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    bctx.restore();
    setTexts([]);
  };

  const pointerPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const strokeTo = (e) => {
    const ctx = bitmapCtxRef.current;
    const p = pointerPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  // ---------------------------------------------------------------- 文本工具

  const hitTestText = (p) => {
    const ctx = ctxRef.current;
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      if (!t.text || !t.text.trim()) continue;
      const { w, h } = measureTextObject(ctx, t);
      if (p.x >= t.x - 4 && p.x <= t.x + w + 4 && p.y >= t.y - 4 && p.y <= t.y + h + 4) {
        return t;
      }
    }
    return null;
  };

  // 打开文本编辑：缓存编辑前快照（确认有改动时才入撤销栈）；baseTexts 用于丢弃空文本后的基准
  const openEditor = (t, baseTexts) => {
    editorSnapshotRef.current = {
      bitmap: bitmapCanvasRef.current.toDataURL(),
      texts: (baseTexts || texts).map((x) => ({ ...x })),
    };
    setEditingId(t.id);
    setFontSize(t.fontSize);
  };

  const updateText = (id, patch) => {
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  // 关闭编辑框：空文本丢弃；有改动则把"编辑前快照"入撤销栈
  const closeEditor = () => {
    const snapshot = editorSnapshotRef.current;
    const current = texts.find((t) => t.id === editingId);
    if (current && !current.text.trim()) {
      setTexts((prev) => prev.filter((t) => t.id !== editingId));
    }
    if (snapshot) {
      const changed =
        JSON.stringify(snapshot.texts) !== JSON.stringify(texts) ||
        snapshot.bitmap !== bitmapCanvasRef.current.toDataURL();
      if (changed) {
        const h = historyRef.current;
        if (h.length >= 30) h.shift();
        h.push(snapshot);
      }
      editorSnapshotRef.current = null;
    }
    setEditingId(null);
  };

  const removeText = (id) => {
    pushHistory();
    setTexts((prev) => prev.filter((t) => t.id !== id));
    setEditingId(null);
    editorSnapshotRef.current = null;
  };

  const handleCanvasTextClick = (e) => {
    // 正在编辑且未输入内容时，先静默丢弃空文本再处理新点击
    const active = texts.find((t) => t.id === editingId);
    let baseTexts = null;
    if (active && !active.text.trim()) {
      baseTexts = texts.filter((t) => t.id !== editingId);
      setTexts(baseTexts);
      editorSnapshotRef.current = null;
    }
    const p = pointerPos(e);
    const hit = hitTestText(p);
    if (hit) {
      openEditor(hit, baseTexts);
      return;
    }
    textSeq += 1;
    const t = {
      id: `txt_${Date.now()}_${textSeq}`,
      x: Math.max(4, Math.min(p.x, CANVAS_W - 20)),
      y: Math.max(4, Math.min(p.y, CANVAS_H - fontSize)),
      text: "",
      fontSize,
      color,
    };
    setTexts((prev) => [...prev, t]);
    openEditor(t, baseTexts);
  };

  // ---------------------------------------------------------------- 指针事件

  const onPointerDown = (e) => {
    e.preventDefault();
    if (tool === "text") {
      handleCanvasTextClick(e);
      return;
    }
    canvasRef.current.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    pushHistory();
    const ctx = bitmapCtxRef.current;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
    ctx.lineWidth = tool === "eraser" ? size * 3 : size;
    const p = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    strokeTo(e);
    renderAll();
  };

  const onPointerMove = (e) => {
    if (!drawingRef.current) return;
    strokeTo(e);
    renderAll();
  };

  const onPointerUp = () => {
    drawingRef.current = false;
  };

  const handlePublish = async () => {
    if (publishing) return;
    if (!isLoggedIn) {
      setMessage("发布画作需要先登录，正在带你去登录...");
      setTimeout(() => navigate("/auth"), 800);
      return;
    }
    // 发布预检：大面积肤色区域提前拦截，避免无效提交
    if (estimateSkinRatio(ctxRef.current) > SKIN_RATIO_LIMIT) {
      setMessage("画作包含大面积人体肤色区域，疑似不当内容，无法发布");
      return;
    }
    try {
      setPublishing(true);
      setMessage("");
      const imageData = canvasRef.current.toDataURL("image/png");
      if (editId) {
        const res = await updateArtwork(editId, { title, description, imageData });
        setMessage("画作已更新，正在带你去看...");
        setTimeout(() => navigate(`/artwork/${res.artwork.id}`), 800);
      } else {
        const res = await publishArtwork({ title, description, imageData });
        setMessage("发布成功，正在带你去看画展...");
        setTimeout(() => navigate(`/artwork/${res.artwork.id}`), 800);
      }
    } catch (err) {
      setMessage(err.message);
      setPublishing(false);
    }
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = canvasRef.current.toDataURL("image/png");
    a.download = `${title.trim() || "我的画作"}.png`;
    a.click();
  };

  // 拍照/上传图片：等比缩放铺到画板，可继续涂鸦后发布（同样经过内容审核）
  const handlePhotoFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("只能选择图片文件哦");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setMessage("图片太大啦，请选 15MB 以内的照片");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const bctx = bitmapCtxRef.current;
        // contain 等比缩放（放大不超过 2 倍），居中铺到画板
        const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height, 2);
        const w = img.width * scale;
        const h = img.height * scale;
        pushHistory();
        bctx.save();
        bctx.globalCompositeOperation = "source-over";
        bctx.fillStyle = "#ffffff";
        bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        bctx.drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
        bctx.restore();
        setTexts([]); // 换底图时清空文字层
        renderAll();
        setMessage("照片已铺上画板！可以继续涂鸦，写好标题就能发布");
      };
      img.onerror = () => setMessage("照片读取失败，换一张试试");
      img.src = reader.result;
    };
    reader.onerror = () => setMessage("照片读取失败，换一张试试");
    reader.readAsDataURL(file);
  };

  // 编辑框位置按画布比例定位（适配任意显示宽度）
  const editorStyle = editingText
    ? {
        left: `${(editingText.x / CANVAS_W) * 100}%`,
        top: `${(editingText.y / CANVAS_H) * 100}%`,
      }
    : null;

  return (
    <div className="container studio">
      <h1 className="page-title">画板创作</h1>
      <p className="page-sub">选好颜色就开画，也可以加文字，画完发布到画展</p>

      <div className="studio-layout">
        <div className="canvas-panel">
          <div className="toolbar">
            <div className="tool-group">
              <button
                className={tool === "brush" ? "tool-btn active" : "tool-btn"}
                onClick={() => { setTool("brush"); setEditingId(null); }}
                title="画笔"
              >
                画笔
              </button>
              <button
                className={tool === "eraser" ? "tool-btn active" : "tool-btn"}
                onClick={() => { setTool("eraser"); setEditingId(null); }}
                title="橡皮擦"
              >
                橡皮
              </button>
              <button
                className={tool === "text" ? "tool-btn active" : "tool-btn"}
                onClick={() => setTool("text")}
                title="文字工具：点击画布添加文字，点击已有文字可编辑"
              >
                文字
              </button>
            </div>

            <div className="tool-group palette">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  className={tool !== "text" && color === c ? "swatch active" : "swatch"}
                  style={{ background: c, border: "2px solid #eee" }}
                  onClick={() => {
                    setColor(c);
                    if (tool === "text" && editingId) {
                      updateText(editingId, { color: c });
                    } else if (tool !== "text") {
                      setTool("brush");
                    }
                  }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={customColor}
                className="color-picker"
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  setColor(e.target.value);
                  if (tool === "text" && editingId) {
                    updateText(editingId, { color: e.target.value });
                  }
                }}
                title="自定义颜色"
              />
            </div>

            {tool === "text" ? (
              <div className="tool-group">
                <label className="size-label">
                  字号 {fontSize}px
                  <input
                    type="range"
                    min="14"
                    max="120"
                    value={fontSize}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setFontSize(v);
                      if (editingId) updateText(editingId, { fontSize: v });
                    }}
                  />
                </label>
              </div>
            ) : (
              <div className="tool-group">
                <label className="size-label">
                  粗细 {size}px
                  <input
                    type="range"
                    min="1"
                    max="40"
                    value={size}
                    onChange={(e) => setSize(Number(e.target.value))}
                  />
                </label>
              </div>
            )}

            <div className="tool-group">
              <button className="tool-btn" onClick={undo}>撤销</button>
              <button className="tool-btn danger" onClick={clearCanvas}>清空</button>
            </div>
          </div>

          {tool === "text" && (
            <p className="text-tool-tip">
              点击画布空白处添加文字；点击已有文字可重新编辑；Enter 换行，Esc 结束编辑
            </p>
          )}

          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              className="drawing-canvas"
              style={{ cursor: tool === "text" ? "text" : "crosshair" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
            {editingText && (
              <div className="text-editor" style={editorStyle}>
                <textarea
                  autoFocus
                  rows={2}
                  value={editingText.text}
                  onChange={(e) => updateText(editingText.id, { text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") closeEditor();
                  }}
                  placeholder="输入文字，Enter 换行"
                />
                <div className="text-editor-bar">
                  <span className="text-editor-size">{editingText.fontSize}px</span>
                  <button className="btn btn-primary btn-sm" onClick={closeEditor}>
                    完成
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => removeText(editingText.id)}>
                    删除文字
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="publish-panel">
          <h2 className="panel-title">发布到画展</h2>
          {editId && (
            <div className="edit-banner">
              正在重画已发布的画作，更新后会替换原画面与信息
            </div>
          )}
          <div className="upload-row">
            <label className="btn-photo">
              拍照作画
              <input type="file" accept="image/*" capture="user" onChange={handlePhotoFile} hidden />
            </label>
            <label className="btn-photo">
              上传图片
              <input type="file" accept="image/*" onChange={handlePhotoFile} hidden />
            </label>
          </div>
          <label className="field">
            画作标题
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：会飞的呆瓜"
              maxLength={50}
            />
          </label>
          <div className="author-badge">
            {isLoggedIn ? (
              <>发布后将署名：<strong>{user.nickname}</strong></>
            ) : (
              <>尚未登录，<Link to="/auth" className="link">去登录</Link>后画作会署你的大名</>
            )}
          </div>
          <label className="field">
            画作简介（可不填）
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="说说这幅画背后的故事..."
              rows={4}
              maxLength={200}
            />
          </label>
          <button
            className="btn btn-primary btn-block"
            onClick={handlePublish}
            disabled={publishing || (!!editId && !editLoaded)}
          >
            {publishing
              ? "提交中..."
              : editId
              ? editLoaded
                ? "更新画作"
                : "正在载入原作..."
              : isLoggedIn
              ? "发布到画展"
              : "登录后发布"}
          </button>
          <button className="btn btn-ghost btn-block" onClick={handleDownload}>
            先保存到电脑看看
          </button>
          <p className="moderation-tip">发布内容会经过审核，含色情低俗信息的画作无法发布</p>
          {message && <p className="publish-message">{message}</p>}
        </div>
      </div>
    </div>
  );
}
