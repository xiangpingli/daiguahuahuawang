import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getArtwork, publishArtwork, updateArtwork } from "../api";
import { useAuth } from "../context/AuthContext";

const CANVAS_W = 960;
const CANVAS_H = 600;

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

export default function Studio() {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawingRef = useRef(false);
  const historyRef = useRef([]);

  const [color, setColor] = useState("#2d3436");
  const [customColor, setCustomColor] = useState("#ff7f50");
  const [size, setSize] = useState(6);
  const [tool, setTool] = useState("brush"); // brush | eraser
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

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
    historyRef.current = [canvas.toDataURL()];
  }, []);

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
          const ctx = ctxRef.current;
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
          ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
          ctx.restore();
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
  }, [editId, isLoggedIn]);

  const pushHistory = () => {
    if (historyRef.current.length >= 30) historyRef.current.shift();
    historyRef.current.push(canvasRef.current.toDataURL());
  };

  const undo = () => {
    if (historyRef.current.length <= 1) return;
    historyRef.current.pop();
    const prev = historyRef.current[historyRef.current.length - 1];
    const img = new Image();
    img.onload = () => {
      const ctx = ctxRef.current;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    };
    img.src = prev;
  };

  const clearCanvas = () => {
    pushHistory();
    const ctx = ctxRef.current;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  };

  const pointerPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const strokeTo = (e) => {
    const ctx = ctxRef.current;
    const p = pointerPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    pushHistory();
    const ctx = ctxRef.current;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
    ctx.lineWidth = tool === "eraser" ? size * 3 : size;
    const p = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    strokeTo(e);
  };

  const onPointerMove = (e) => {
    if (!drawingRef.current) return;
    strokeTo(e);
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
        const ctx = ctxRef.current;
        // contain 等比缩放（放大不超过 2 倍），居中铺到画板
        const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height, 2);
        const w = img.width * scale;
        const h = img.height * scale;
        pushHistory();
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
        ctx.restore();
        setMessage("照片已铺上画板！可以继续涂鸦，写好标题就能发布");
      };
      img.onerror = () => setMessage("照片读取失败，换一张试试");
      img.src = reader.result;
    };
    reader.onerror = () => setMessage("照片读取失败，换一张试试");
    reader.readAsDataURL(file);
  };

  return (
    <div className="container studio">
      <h1 className="page-title">画板创作</h1>
      <p className="page-sub">选好颜色就开画，画完填上标题发布到画展</p>

      <div className="studio-layout">
        <div className="canvas-panel">
          <div className="toolbar">
            <div className="tool-group">
              <button
                className={tool === "brush" ? "tool-btn active" : "tool-btn"}
                onClick={() => setTool("brush")}
                title="画笔"
              >
                画笔
              </button>
              <button
                className={tool === "eraser" ? "tool-btn active" : "tool-btn"}
                onClick={() => setTool("eraser")}
                title="橡皮擦"
              >
                橡皮
              </button>
            </div>

            <div className="tool-group palette">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  className={tool === "brush" && color === c ? "swatch active" : "swatch"}
                  style={{ background: c, border: "2px solid #eee" }}
                  onClick={() => {
                    setColor(c);
                    setTool("brush");
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
                  setTool("brush");
                }}
                title="自定义颜色"
              />
            </div>

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

            <div className="tool-group">
              <button className="tool-btn" onClick={undo}>撤销</button>
              <button className="tool-btn danger" onClick={clearCanvas}>清空</button>
            </div>
          </div>

          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              className="drawing-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
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
