"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULTS = {
  topText: "El humor de Mirtha Legrand",
  topFontSize: 58,
  topLineHeight: 1.08,
  topMaxLines: 3,
  topGap: 26,
  topMarginPx: 25,
  topAlign: "left",

  bottomText: "",
  bottomFontSize: 58,
  bottomLineHeight: 1.08,
  bottomMaxLines: 3,
  bottomGap: 26,
  bottomMarginPx: 25,
  bottomAlign: "left",

  frameHeightPct: 32,
  blockOffsetY: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function formatTime(sec) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function extension(name, fallback) {
  const m = name?.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : fallback;
}

function textAnchor(align, x, width) {
  if (align === "center") return x + width / 2;
  if (align === "right") return x + width;
  return x;
}

export default function Page() {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const templateImgRef = useRef(null);

  const topFontFamilyRef = useRef("MemeTopCustom");
  const bottomFontFamilyRef = useRef("MemeBottomCustom");

  const draggingRef = useRef(null);
  const ffmpegRef = useRef(null);

  const [templateFile, setTemplateFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [templateUrl, setTemplateUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [templateSize, setTemplateSize] = useState({ w: 1080, h: 1920 });
  const [videoSize, setVideoSize] = useState({ w: 1920, h: 1080 });
  const [duration, setDuration] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // Texto superior
  const [topText, setTopText] = useState(DEFAULTS.topText);
  const [topFontSize, setTopFontSize] = useState(DEFAULTS.topFontSize);
  const [topLineHeight, setTopLineHeight] = useState(DEFAULTS.topLineHeight);
  const [topMaxLines, setTopMaxLines] = useState(DEFAULTS.topMaxLines);
  const [topGap, setTopGap] = useState(DEFAULTS.topGap);
  const [topMarginPx, setTopMarginPx] = useState(DEFAULTS.topMarginPx);
  const [topAlign, setTopAlign] = useState(DEFAULTS.topAlign);
  const [topFontName, setTopFontName] = useState("Sistema");

  // Texto inferior
  const [bottomText, setBottomText] = useState(DEFAULTS.bottomText);
  const [bottomFontSize, setBottomFontSize] = useState(DEFAULTS.bottomFontSize);
  const [bottomLineHeight, setBottomLineHeight] = useState(DEFAULTS.bottomLineHeight);
  const [bottomMaxLines, setBottomMaxLines] = useState(DEFAULTS.bottomMaxLines);
  const [bottomGap, setBottomGap] = useState(DEFAULTS.bottomGap);
  const [bottomMarginPx, setBottomMarginPx] = useState(DEFAULTS.bottomMarginPx);
  const [bottomAlign, setBottomAlign] = useState(DEFAULTS.bottomAlign);
  const [bottomFontName, setBottomFontName] = useState("Sistema");

  // Video / bloque
  const [frameHeightPct, setFrameHeightPct] = useState(DEFAULTS.frameHeightPct);
  const [blockOffsetY, setBlockOffsetY] = useState(DEFAULTS.blockOffsetY);
  const [zoom, setZoom] = useState(DEFAULTS.zoom);
  const [panX, setPanX] = useState(DEFAULTS.panX);
  const [panY, setPanY] = useState(DEFAULTS.panY);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Subí una plantilla y un video para empezar.");

  useEffect(() => {
    return () => {
      if (templateUrl) URL.revokeObjectURL(templateUrl);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [templateUrl, videoUrl]);

  const systemFont = 'Arial, Helvetica, sans-serif';

  const topFontFamily = topFontName === "Sistema"
    ? systemFont
    : `"${topFontFamilyRef.current}", Arial, sans-serif`;

  const bottomFontFamily = bottomFontName === "Sistema"
    ? systemFont
    : `"${bottomFontFamilyRef.current}", Arial, sans-serif`;

  function wrapText(ctx, value, maxWidth, startSize, maxLines, fontFamily) {
    const normalized = (value || "").trim().replace(/\s+/g, " ");
    if (!normalized) return { lines: [], size: startSize };

    let size = startSize;
    const minSize = Math.max(18, Math.round(templateSize.w * 0.025));

    while (size >= minSize) {
      ctx.font = `700 ${size}px ${fontFamily}`;
      const words = normalized.split(" ");
      const lines = [];
      let line = "";

      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth || !line) {
          line = test;
        } else {
          lines.push(line);
          line = word;
        }
      }

      if (line) lines.push(line);
      if (lines.length <= maxLines) return { lines, size };
      size -= 2;
    }

    ctx.font = `700 ${minSize}px ${fontFamily}`;
    const words = normalized.split(" ");
    const lines = [];
    let line = "";

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !line) {
        line = test;
      } else {
        lines.push(line);
        line = word;
      }
    }

    if (line) lines.push(line);
    return { lines: lines.slice(0, maxLines), size: minSize };
  }

  function getGeometry(ctx) {
    const W = templateSize.w;
    const H = templateSize.h;

    // Video siempre a todo el ancho.
    const frameW = W;
    const frameH = Math.round(H * (frameHeightPct / 100));
    const frameX = 0;

    // Texto superior: márgenes y configuración independientes.
    const topTextX = Math.max(0, Math.round(topMarginPx));
    const topTextW = Math.max(1, W - topTextX * 2);
    const topWrapped = wrapText(
      ctx,
      topText,
      topTextW,
      topFontSize,
      topMaxLines,
      topFontFamily
    );
    const topLineHeightPx = Math.round(topWrapped.size * topLineHeight);
    const topTextH = topWrapped.lines.length > 0
      ? topWrapped.lines.length * topLineHeightPx
      : 0;

    // Texto inferior: completamente independiente.
    const bottomTextX = Math.max(0, Math.round(bottomMarginPx));
    const bottomTextW = Math.max(1, W - bottomTextX * 2);
    const bottomWrapped = wrapText(
      ctx,
      bottomText,
      bottomTextW,
      bottomFontSize,
      bottomMaxLines,
      bottomFontFamily
    );
    const bottomLineHeightPx = Math.round(bottomWrapped.size * bottomLineHeight);
    const bottomTextH = bottomWrapped.lines.length > 0
      ? bottomWrapped.lines.length * bottomLineHeightPx
      : 0;

    // Si un texto está vacío, no agrega separación extra.
    const effectiveTopGap = topTextH > 0 ? topGap : 0;
    const effectiveBottomGap = bottomTextH > 0 ? bottomGap : 0;

    // Texto superior + video + texto inferior funcionan como un solo bloque.
    const blockH =
      topTextH +
      effectiveTopGap +
      frameH +
      effectiveBottomGap +
      bottomTextH;

    const blockY = Math.round((H - blockH) / 2 + blockOffsetY);

    const topTextY = blockY;
    const videoY = topTextY + topTextH + effectiveTopGap;
    const bottomTextY = videoY + frameH + effectiveBottomGap;

    return {
      W,
      H,
      frameW,
      frameH,
      frameX,
      videoY,

      topTextX,
      topTextW,
      topTextY,
      topTextH,
      topLines: topWrapped.lines,
      topFittedFontSize: topWrapped.size,
      topLineHeightPx,

      bottomTextX,
      bottomTextW,
      bottomTextY,
      bottomTextH,
      bottomLines: bottomWrapped.lines,
      bottomFittedFontSize: bottomWrapped.size,
      bottomLineHeightPx,
    };
  }

  function getSourceCrop(frameW, frameH) {
    const sw = videoSize.w || 1;
    const sh = videoSize.h || 1;
    const frameAR = frameW / frameH;
    const srcAR = sw / sh;
    let baseW;
    let baseH;

    if (srcAR > frameAR) {
      baseH = sh;
      baseW = sh * frameAR;
    } else {
      baseW = sw;
      baseH = sw / frameAR;
    }

    const cropW = clamp(baseW / zoom, 2, sw);
    const cropH = clamp(baseH / zoom, 2, sh);
    const maxX = Math.max(0, sw - cropW);
    const maxY = Math.max(0, sh - cropH);
    const x = ((panX + 1) / 2) * maxX;
    const y = ((panY + 1) / 2) * maxY;

    return { x, y, w: cropW, h: cropH };
  }

  function drawTextBlock(ctx, options) {
    const {
      lines,
      x,
      width,
      y,
      fontSize,
      lineHeightPx,
      align,
      fontFamily,
    } = options;

    if (!lines?.length) return;

    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "top";
    ctx.textAlign = align;
    ctx.font = `700 ${fontSize}px ${fontFamily}`;

    const anchorX = textAnchor(align, x, width);

    lines.forEach((line, i) => {
      ctx.fillText(line, anchorX, y + i * lineHeightPx);
    });

    ctx.restore();
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const { w: W, h: H } = templateSize;

    canvas.width = W;
    canvas.height = H;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#11141b";
    ctx.fillRect(0, 0, W, H);

    if (templateImgRef.current?.complete) {
      ctx.drawImage(templateImgRef.current, 0, 0, W, H);
    }

    const g = getGeometry(ctx);

    drawTextBlock(ctx, {
      lines: g.topLines,
      x: g.topTextX,
      width: g.topTextW,
      y: g.topTextY,
      fontSize: g.topFittedFontSize,
      lineHeightPx: g.topLineHeightPx,
      align: topAlign,
      fontFamily: topFontFamily,
    });

    const video = videoRef.current;

    if (video && video.readyState >= 2 && videoFile) {
      const c = getSourceCrop(g.frameW, g.frameH);

      ctx.save();
      ctx.beginPath();
      ctx.rect(g.frameX, g.videoY, g.frameW, g.frameH);
      ctx.clip();
      ctx.drawImage(
        video,
        c.x,
        c.y,
        c.w,
        c.h,
        g.frameX,
        g.videoY,
        g.frameW,
        g.frameH
      );
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(255,255,255,.08)";
      ctx.fillRect(g.frameX, g.videoY, g.frameW, g.frameH);
      ctx.strokeStyle = "rgba(255,255,255,.3)";
      ctx.strokeRect(g.frameX, g.videoY, g.frameW, g.frameH);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = `${Math.max(24, Math.round(W * 0.025))}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("VIDEO", W / 2, g.videoY + g.frameH / 2);
    }

    drawTextBlock(ctx, {
      lines: g.bottomLines,
      x: g.bottomTextX,
      width: g.bottomTextW,
      y: g.bottomTextY,
      fontSize: g.bottomFittedFontSize,
      lineHeightPx: g.bottomLineHeightPx,
      align: bottomAlign,
      fontFamily: bottomFontFamily,
    });

    // Guía visual del área del video. No se exporta porque solo existe en preview.
    ctx.save();
    ctx.strokeStyle = "rgba(124,92,255,.95)";
    ctx.lineWidth = Math.max(2, W / 500);
    ctx.setLineDash([12, 10]);
    ctx.strokeRect(g.frameX, g.videoY, g.frameW, g.frameH);
    ctx.restore();
  }

  useEffect(() => {
    draw();
  }, [
    templateSize,
    videoSize,
    topText,
    topFontSize,
    topLineHeight,
    topMaxLines,
    topGap,
    topMarginPx,
    topAlign,
    topFontName,
    bottomText,
    bottomFontSize,
    bottomLineHeight,
    bottomMaxLines,
    bottomGap,
    bottomMarginPx,
    bottomAlign,
    bottomFontName,
    frameHeightPct,
    blockOffsetY,
    zoom,
    panX,
    panY,
    templateUrl,
    videoUrl,
    playhead,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let raf = 0;

    const tick = () => {
      if (!video.paused && !video.ended) {
        setPlayhead(video.currentTime);
        draw();
        raf = requestAnimationFrame(tick);
      }
    };

    const onPlay = () => {
      raf = requestAnimationFrame(tick);
    };

    video.addEventListener("play", onPlay);

    return () => {
      video.removeEventListener("play", onPlay);
      cancelAnimationFrame(raf);
    };
  }, [videoUrl]);

  async function onTemplate(file) {
    if (!file) return;

    if (templateUrl) URL.revokeObjectURL(templateUrl);

    const url = URL.createObjectURL(file);
    setTemplateFile(file);
    setTemplateUrl(url);

    const img = new Image();

    img.onload = () => {
      templateImgRef.current = img;
      setTemplateSize({
        w: img.naturalWidth,
        h: img.naturalHeight,
      });
      setStatus(`Plantilla cargada: ${img.naturalWidth}×${img.naturalHeight}px`);
      requestAnimationFrame(draw);
    };

    img.src = url;
  }

  function onVideo(file) {
    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setStatus("Video cargado. Ajustá el encuadre y los textos.");
  }

  async function onFont(file, target) {
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const family = `Uploaded_${target}_${Date.now()}`;
      const face = new FontFace(family, data, { weight: "700" });

      await face.load();
      document.fonts.add(face);

      if (target === "top") {
        topFontFamilyRef.current = family;
        setTopFontName(file.name);
      } else {
        bottomFontFamilyRef.current = family;
        setBottomFontName(file.name);
      }

      setStatus(`Fuente cargada para texto ${target === "top" ? "superior" : "inferior"}: ${file.name}`);
    } catch (e) {
      setStatus("No pude cargar esa fuente. Probá con .ttf, .otf o .woff2.");
    }
  }

  function onVideoLoaded(e) {
    const v = e.currentTarget;
    setVideoSize({ w: v.videoWidth, h: v.videoHeight });
    setDuration(v.duration || 0);
    setTrimStart(0);
    setTrimEnd(v.duration || 0);
    setPlayhead(0);
    requestAnimationFrame(draw);
  }

  function seek(value) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = value;
    setPlayhead(value);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  }

  function canvasPoint(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function onPointerDown(e) {
    const canvas = canvasRef.current;
    if (!canvas || !videoFile) return;

    const ctx = canvas.getContext("2d");
    const g = getGeometry(ctx);
    const p = canvasPoint(e);

    const inside =
      p.x >= g.frameX &&
      p.x <= g.frameX + g.frameW &&
      p.y >= g.videoY &&
      p.y <= g.videoY + g.frameH;

    if (!inside) return;

    canvas.setPointerCapture(e.pointerId);
    draggingRef.current = {
      x: p.x,
      y: p.y,
      panX,
      panY,
    };
  }

  function onPointerMove(e) {
    const d = draggingRef.current;
    if (!d) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const g = getGeometry(ctx);
    const p = canvasPoint(e);

    const dx = (p.x - d.x) / Math.max(1, g.frameW);
    const dy = (p.y - d.y) / Math.max(1, g.frameH);

    setPanX(clamp(d.panX - dx * 2, -1, 1));
    setPanY(clamp(d.panY - dy * 2, -1, 1));
  }

  function onPointerUp() {
    draggingRef.current = null;
  }

  function resetFrame() {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }

  function drawTextPng() {
    const c = document.createElement("canvas");
    c.width = templateSize.w;
    c.height = templateSize.h;

    const ctx = c.getContext("2d");
    const g = getGeometry(ctx);

    ctx.clearRect(0, 0, c.width, c.height);

    drawTextBlock(ctx, {
      lines: g.topLines,
      x: g.topTextX,
      width: g.topTextW,
      y: g.topTextY,
      fontSize: g.topFittedFontSize,
      lineHeightPx: g.topLineHeightPx,
      align: topAlign,
      fontFamily: topFontFamily,
    });

    drawTextBlock(ctx, {
      lines: g.bottomLines,
      x: g.bottomTextX,
      width: g.bottomTextW,
      y: g.bottomTextY,
      fontSize: g.bottomFittedFontSize,
      lineHeightPx: g.bottomLineHeightPx,
      align: bottomAlign,
      fontFamily: bottomFontFamily,
    });

    return new Promise((resolve) => c.toBlob(resolve, "image/png"));
  }

  async function exportVideo() {
    if (!templateFile || !videoFile) {
      setStatus("Primero subí la plantilla y el video.");
      return;
    }

    if (trimEnd <= trimStart + 0.05) {
      setStatus("El rango de recorte no es válido.");
      return;
    }

    setExporting(true);
    setProgress(0);
    setStatus("Preparando exportación… La primera vez puede tardar mientras carga FFmpeg.");

    try {
      const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);

      let ffmpeg = ffmpegRef.current;

      if (!ffmpeg) {
        ffmpeg = new FFmpeg();

        ffmpeg.on("progress", ({ progress: p }) => {
          setProgress(clamp(Math.round(p * 100), 0, 100));
        });

        ffmpeg.on("log", ({ message }) => {
          if (message?.includes("time=")) {
            setStatus("Renderizando el video en tu navegador…");
          }
        });

        const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

        await ffmpeg.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
        });

        ffmpegRef.current = ffmpeg;
      }

      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = templateSize.w;
      tmpCanvas.height = templateSize.h;

      const tmpCtx = tmpCanvas.getContext("2d");
      const g = getGeometry(tmpCtx);
      const crop = getSourceCrop(g.frameW, g.frameH);
      const textBlob = await drawTextPng();

      const bgName = `background.${extension(templateFile.name, "png")}`;
      const vidName = `source.${extension(videoFile.name, "mp4")}`;

      await ffmpeg.writeFile(bgName, await fetchFile(templateFile));
      await ffmpeg.writeFile(vidName, await fetchFile(videoFile));
      await ffmpeg.writeFile("text.png", await fetchFile(textBlob));

      const outName = "meme-video.mp4";
      const start = Math.max(0, trimStart).toFixed(3);
      const length = Math.max(0.05, trimEnd - trimStart).toFixed(3);

      const cropW = Math.max(2, Math.floor(crop.w / 2) * 2);
      const cropH = Math.max(2, Math.floor(crop.h / 2) * 2);
      const cropX = Math.max(0, Math.floor(crop.x / 2) * 2);
      const cropY = Math.max(0, Math.floor(crop.y / 2) * 2);
      const frameW = Math.max(2, Math.floor(g.frameW / 2) * 2);
      const frameH = Math.max(2, Math.floor(g.frameH / 2) * 2);

      const filter = [
        `[0:v]scale=${templateSize.w}:${templateSize.h}[bg]`,
        `[1:v]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${frameW}:${frameH}[vid]`,
        `[bg][2:v]overlay=0:0[base]`,
        `[base][vid]overlay=${g.frameX}:${g.videoY}:shortest=1[outv]`,
      ].join(";");

      const args = [
        "-loop", "1", "-i", bgName,
        "-ss", start, "-t", length, "-i", vidName,
        "-i", "text.png",
        "-filter_complex", filter,
        "-map", "[outv]",
        "-map", "1:a?",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "160k",
        "-shortest",
        "-movflags", "+faststart",
        outName,
      ];

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `meme-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1500);

      setProgress(100);
      setStatus("Listo. El MP4 se generó y descargó.");
    } catch (err) {
      console.error(err);
      setStatus(`No se pudo exportar: ${err?.message || "error desconocido"}`);
    } finally {
      setExporting(false);
    }
  }

  const trimMax = duration || 0;
  const canExport = templateFile && videoFile && !exporting;

  return (
    <main className="pageShell">
      <header className="topbar">
        <div>
          <div className="eyebrow">LOCAL · GRATIS · SIN SUBIR TU VIDEO</div>
          <h1>Meme Video Editor</h1>
          <p>Texto superior + video + texto inferior opcional. Cada texto se configura de forma independiente.</p>
        </div>
        <div className="badge">Vercel</div>
      </header>

      <section className="workspace">
        <aside className="panel controls">
          <div className="sectionTitle">1. Archivos</div>

          <label className="uploadBox">
            <span>Plantilla PNG/JPG</span>
            <small>{templateFile ? templateFile.name : "Subí tu fondo final"}</small>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onTemplate(e.target.files?.[0])}
            />
          </label>

          <label className="uploadBox">
            <span>Video</span>
            <small>{videoFile ? videoFile.name : "MP4, MOV, WebM…"}</small>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => onVideo(e.target.files?.[0])}
            />
          </label>

          <div className="sectionTitle">2. Texto superior</div>

          <label className="field">
            <span>Texto</span>
            <textarea
              value={topText}
              onChange={(e) => setTopText(e.target.value)}
              rows={3}
              placeholder="Escribí el texto superior…"
            />
          </label>

          <label className="uploadBox compact">
            <span>Fuente del texto superior</span>
            <small>{topFontName}</small>
            <input
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              onChange={(e) => onFont(e.target.files?.[0], "top")}
            />
          </label>

          <div className="grid2">
            <label className="field">
              <span>Alineación</span>
              <select value={topAlign} onChange={(e) => setTopAlign(e.target.value)}>
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </select>
            </label>

            <label className="field">
              <span>Tamaño máximo</span>
              <input
                type="number"
                min="18"
                max="180"
                value={topFontSize}
                onChange={(e) => setTopFontSize(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="grid2">
            <label className="field">
              <span>Máx. líneas</span>
              <select value={topMaxLines} onChange={(e) => setTopMaxLines(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>

            <label className="field">
              <span>Margen lateral</span>
              <input
                type="number"
                min="0"
                max="300"
                value={topMarginPx}
                onChange={(e) => setTopMarginPx(Number(e.target.value))}
              />
            </label>
          </div>

          <Range
            label="Interlineado superior"
            value={topLineHeight}
            min={0.9}
            max={1.5}
            step={0.01}
            suffix="×"
            onChange={setTopLineHeight}
          />

          <Range
            label="Separación superior / video"
            value={topGap}
            min={0}
            max={160}
            step={1}
            suffix="px"
            onChange={setTopGap}
          />

          <div className="sectionTitle">3. Video y bloque</div>

          <Range
            label="Alto del video"
            value={frameHeightPct}
            min={15}
            max={60}
            step={1}
            suffix="%"
            onChange={setFrameHeightPct}
          />

          <div className="status">
            El video ocupa siempre el 100% del ancho. Los márgenes solo afectan a cada texto.
          </div>

          <Range
            label="Mover bloque completo"
            value={blockOffsetY}
            min={-400}
            max={400}
            step={2}
            suffix="px"
            onChange={setBlockOffsetY}
          />

          <div className="sectionTitle">4. Texto inferior opcional</div>

          <label className="field">
            <span>Texto</span>
            <textarea
              value={bottomText}
              onChange={(e) => setBottomText(e.target.value)}
              rows={3}
              placeholder="Dejalo vacío si no querés texto debajo del video…"
            />
          </label>

          <label className="uploadBox compact">
            <span>Fuente del texto inferior</span>
            <small>{bottomFontName}</small>
            <input
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              onChange={(e) => onFont(e.target.files?.[0], "bottom")}
            />
          </label>

          <div className="grid2">
            <label className="field">
              <span>Alineación</span>
              <select value={bottomAlign} onChange={(e) => setBottomAlign(e.target.value)}>
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </select>
            </label>

            <label className="field">
              <span>Tamaño máximo</span>
              <input
                type="number"
                min="18"
                max="180"
                value={bottomFontSize}
                onChange={(e) => setBottomFontSize(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="grid2">
            <label className="field">
              <span>Máx. líneas</span>
              <select value={bottomMaxLines} onChange={(e) => setBottomMaxLines(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>

            <label className="field">
              <span>Margen lateral</span>
              <input
                type="number"
                min="0"
                max="300"
                value={bottomMarginPx}
                onChange={(e) => setBottomMarginPx(Number(e.target.value))}
              />
            </label>
          </div>

          <Range
            label="Interlineado inferior"
            value={bottomLineHeight}
            min={0.9}
            max={1.5}
            step={0.01}
            suffix="×"
            onChange={setBottomLineHeight}
          />

          <Range
            label="Separación video / inferior"
            value={bottomGap}
            min={0}
            max={160}
            step={1}
            suffix="px"
            onChange={setBottomGap}
          />

          <div className="sectionTitle">5. Encuadre</div>

          <Range
            label="Zoom"
            value={zoom}
            min={1}
            max={3}
            step={0.01}
            suffix="×"
            onChange={setZoom}
          />

          <Range
            label="Mover horizontal"
            value={panX}
            min={-1}
            max={1}
            step={0.01}
            suffix=""
            onChange={setPanX}
          />

          <Range
            label="Mover vertical"
            value={panY}
            min={-1}
            max={1}
            step={0.01}
            suffix=""
            onChange={setPanY}
          />

          <button className="secondary" onClick={resetFrame}>
            Centrar video
          </button>

          <div className="sectionTitle">6. Recorte temporal</div>

          <div className="trimLabels">
            <span>Inicio {formatTime(trimStart)}</span>
            <span>Fin {formatTime(trimEnd)}</span>
          </div>

          <Range
            label="Inicio"
            value={trimStart}
            min={0}
            max={Math.max(0, trimMax)}
            step={0.05}
            suffix="s"
            onChange={(v) => setTrimStart(Math.min(v, trimEnd - 0.05))}
          />

          <Range
            label="Fin"
            value={trimEnd}
            min={0}
            max={Math.max(0, trimMax)}
            step={0.05}
            suffix="s"
            onChange={(v) => setTrimEnd(Math.max(v, trimStart + 0.05))}
          />

          <button className="exportBtn" disabled={!canExport} onClick={exportVideo}>
            {exporting ? `Exportando ${progress}%` : "Exportar MP4"}
          </button>

          {exporting && (
            <div className="progress">
              <div style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="status">{status}</div>
        </aside>

        <section className="previewPanel">
          <div className="previewHeader">
            <div>
              <strong>Vista previa</strong>
              <span>{templateSize.w}×{templateSize.h}px</span>
            </div>
            <div className="previewTips">Arrastrá sobre el video para reencuadrarlo</div>
          </div>

          <div className="canvasWrap">
            <canvas
              ref={canvasRef}
              className="previewCanvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>

          <div className="transport">
            <button onClick={togglePlay} disabled={!videoFile}>
              {videoRef.current?.paused === false ? "Pausa" : "Play"}
            </button>

            <input
              type="range"
              min={0}
              max={Math.max(duration, 0)}
              step="0.01"
              value={playhead}
              onChange={(e) => seek(Number(e.target.value))}
              disabled={!videoFile}
            />

            <span>
              {formatTime(playhead)} / {formatTime(duration)}
            </span>
          </div>

          <p className="localNote">
            El video y la plantilla se procesan localmente en tu navegador. Vercel solo sirve la web.
          </p>
        </section>
      </section>

      <video
        ref={videoRef}
        src={videoUrl || undefined}
        onLoadedMetadata={onVideoLoaded}
        onSeeked={() => {
          setPlayhead(videoRef.current?.currentTime || 0);
          draw();
        }}
        playsInline
        style={{ display: "none" }}
      />
    </main>
  );
}

function Range({ label, value, min, max, step, suffix, onChange }) {
  return (
    <label className="rangeField">
      <div>
        <span>{label}</span>
        <b>
          {typeof value === "number" ? Number(value.toFixed(2)) : value}
          {suffix}
        </b>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
