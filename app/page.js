"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULTS = {
  text: "El humor de Mirtha Legrand",
  fontSize: 58,
  lineHeight: 1.08,
  maxLines: 3,
  gap: 26,
  frameHeightPct: 32,
  textMarginPx: 25,
  blockOffsetY: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  textStroke: 0,
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

export default function Page() {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const templateImgRef = useRef(null);
  const fontFamilyRef = useRef("MemeCustom");
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
  const [text, setText] = useState(DEFAULTS.text);
  const [fontSize, setFontSize] = useState(DEFAULTS.fontSize);
  const [lineHeight, setLineHeight] = useState(DEFAULTS.lineHeight);
  const [maxLines, setMaxLines] = useState(DEFAULTS.maxLines);
  const [gap, setGap] = useState(DEFAULTS.gap);
  const [frameHeightPct, setFrameHeightPct] = useState(DEFAULTS.frameHeightPct);
  const [textMarginPx, setTextMarginPx] = useState(DEFAULTS.textMarginPx);
  const [blockOffsetY, setBlockOffsetY] = useState(DEFAULTS.blockOffsetY);
  const [zoom, setZoom] = useState(DEFAULTS.zoom);
  const [panX, setPanX] = useState(DEFAULTS.panX);
  const [panY, setPanY] = useState(DEFAULTS.panY);
  const [fontName, setFontName] = useState("Sistema");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Subí una plantilla y un video para empezar.");

  useEffect(() => {
    return () => {
      if (templateUrl) URL.revokeObjectURL(templateUrl);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [templateUrl, videoUrl]);

  const fontFamily = fontName === "Sistema"
    ? 'Arial, Helvetica, sans-serif'
    : `"${fontFamilyRef.current}", Arial, sans-serif`;

  function wrapText(ctx, value, maxWidth, startSize = fontSize) {
    const normalized = (value || "").trim().replace(/\s+/g, " ");
    if (!normalized) return { lines: [""], size: startSize };

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
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else {
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
    // El video siempre ocupa todo el ancho de la plantilla.
    const frameW = W;
    const frameH = Math.round(H * (frameHeightPct / 100));
    const frameX = 0;

    // Solo el texto tiene márgenes laterales. Por defecto: 25 px a cada lado.
    const textX = Math.max(0, Math.round(textMarginPx));
    const textW = Math.max(1, W - textX * 2);
    const wrapped = wrapText(ctx, text, textW, fontSize);
    const lh = Math.round(wrapped.size * lineHeight);
    const textH = Math.max(lh, wrapped.lines.length * lh);
    const blockH = textH + gap + frameH;
    const blockY = Math.round((H - blockH) / 2 + blockOffsetY);
    const textY = blockY;
    const videoY = textY + textH + gap;

    return {
      W, H, frameW, frameH, frameX, textX, textW, textY, videoY, textH,
      lines: wrapped.lines, fittedFontSize: wrapped.size, lineHeightPx: lh
    };
  }

  function getSourceCrop(frameW, frameH) {
    const sw = videoSize.w || 1;
    const sh = videoSize.h || 1;
    const frameAR = frameW / frameH;
    const srcAR = sw / sh;
    let baseW, baseH;

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

    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = `700 ${g.fittedFontSize}px ${fontFamily}`;
    g.lines.forEach((line, i) => {
      ctx.fillText(line, g.textX, g.textY + i * g.lineHeightPx);
    });
    ctx.restore();

    const video = videoRef.current;
    if (video && video.readyState >= 2 && videoFile) {
      const c = getSourceCrop(g.frameW, g.frameH);
      ctx.save();
      ctx.beginPath();
      ctx.rect(g.frameX, g.videoY, g.frameW, g.frameH);
      ctx.clip();
      ctx.drawImage(video, c.x, c.y, c.w, c.h, g.frameX, g.videoY, g.frameW, g.frameH);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(255,255,255,.08)";
      ctx.fillRect(g.frameX, g.videoY, g.frameW, g.frameH);
      ctx.strokeStyle = "rgba(255,255,255,.3)";
      ctx.strokeRect(g.frameX, g.videoY, g.frameW, g.frameH);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = `${Math.max(24, Math.round(W * .025))}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("VIDEO", W / 2, g.videoY + g.frameH / 2);
    }

    ctx.save();
    ctx.strokeStyle = "rgba(124,92,255,.95)";
    ctx.lineWidth = Math.max(2, W / 500);
    ctx.setLineDash([12, 10]);
    ctx.strokeRect(g.frameX, g.videoY, g.frameW, g.frameH);
    ctx.restore();
  }

  useEffect(() => {
    draw();
  }, [templateSize, videoSize, text, fontSize, lineHeight, maxLines, gap, frameHeightPct, textMarginPx, blockOffsetY, zoom, panX, panY, fontName, templateUrl, videoUrl, playhead]);

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
    const onPlay = () => { raf = requestAnimationFrame(tick); };
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
      setTemplateSize({ w: img.naturalWidth, h: img.naturalHeight });
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
    setStatus("Video cargado. Ajustá el encuadre y el texto.");
  }

  async function onFont(file) {
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const family = `Uploaded_${Date.now()}`;
      const face = new FontFace(family, data, { weight: "700" });
      await face.load();
      document.fonts.add(face);
      fontFamilyRef.current = family;
      setFontName(file.name);
      setStatus(`Fuente cargada: ${file.name}`);
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
    if (v.paused) v.play(); else v.pause();
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
    const inside = p.x >= g.frameX && p.x <= g.frameX + g.frameW && p.y >= g.videoY && p.y <= g.videoY + g.frameH;
    if (!inside) return;
    canvas.setPointerCapture(e.pointerId);
    draggingRef.current = { x: p.x, y: p.y, panX, panY };
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
    ctx.fillStyle = "white";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = `700 ${g.fittedFontSize}px ${fontFamily}`;
    g.lines.forEach((line, i) => ctx.fillText(line, g.textX, g.textY + i * g.lineHeightPx));
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
        import("@ffmpeg/util")
      ]);

      let ffmpeg = ffmpegRef.current;
      if (!ffmpeg) {
        ffmpeg = new FFmpeg();
        ffmpeg.on("progress", ({ progress: p }) => setProgress(clamp(Math.round(p * 100), 0, 100)));
        ffmpeg.on("log", ({ message }) => {
          if (message?.includes("time=")) setStatus("Renderizando el video en tu navegador…");
        });
        const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm")
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
        `[base][vid]overlay=${g.frameX}:${g.videoY}:shortest=1[outv]`
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
        outName
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
          <p>Plantilla fija + texto con márgenes propios + video a todo el ancho. El bloque se mantiene centrado.</p>
        </div>
        <div className="badge">Vercel</div>
      </header>

      <section className="workspace">
        <aside className="panel controls">
          <div className="sectionTitle">1. Archivos</div>

          <label className="uploadBox">
            <span>Plantilla PNG/JPG</span>
            <small>{templateFile ? templateFile.name : "Subí tu fondo final"}</small>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onTemplate(e.target.files?.[0])} />
          </label>

          <label className="uploadBox">
            <span>Video</span>
            <small>{videoFile ? videoFile.name : "MP4, MOV, WebM…"}</small>
            <input type="file" accept="video/*" onChange={(e) => onVideo(e.target.files?.[0])} />
          </label>

          <label className="uploadBox compact">
            <span>Fuente opcional</span>
            <small>{fontName}</small>
            <input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={(e) => onFont(e.target.files?.[0])} />
          </label>

          <div className="sectionTitle">2. Texto</div>
          <label className="field">
            <span>Texto del meme</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Escribí el texto…" />
          </label>

          <div className="grid2">
            <label className="field">
              <span>Tamaño máximo</span>
              <input type="number" min="18" max="180" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Máx. líneas</span>
              <select value={maxLines} onChange={(e) => setMaxLines(Number(e.target.value))}>
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
              </select>
            </label>
          </div>

          <Range label="Separación texto / video" value={gap} min={0} max={120} step={1} suffix="px" onChange={setGap} />
          <Range label="Interlineado" value={lineHeight} min={0.9} max={1.5} step={0.01} suffix="×" onChange={setLineHeight} />

          <div className="sectionTitle">3. Texto y video</div>
          <Range label="Margen lateral del texto" value={textMarginPx} min={0} max={160} step={1} suffix="px" onChange={setTextMarginPx} />
          <Range label="Alto del video" value={frameHeightPct} min={15} max={60} step={1} suffix="%" onChange={setFrameHeightPct} />
          <div className="status">El video ocupa siempre el 100% del ancho. El margen solo afecta al texto.</div>
          <Range label="Mover bloque completo" value={blockOffsetY} min={-400} max={400} step={2} suffix="px" onChange={setBlockOffsetY} />

          <div className="sectionTitle">4. Encuadre</div>
          <Range label="Zoom" value={zoom} min={1} max={3} step={0.01} suffix="×" onChange={setZoom} />
          <Range label="Mover horizontal" value={panX} min={-1} max={1} step={0.01} suffix="" onChange={setPanX} />
          <Range label="Mover vertical" value={panY} min={-1} max={1} step={0.01} suffix="" onChange={setPanY} />
          <button className="secondary" onClick={resetFrame}>Centrar video</button>

          <div className="sectionTitle">5. Recorte temporal</div>
          <div className="trimLabels"><span>Inicio {formatTime(trimStart)}</span><span>Fin {formatTime(trimEnd)}</span></div>
          <Range label="Inicio" value={trimStart} min={0} max={Math.max(0, trimMax)} step={0.05} suffix="s" onChange={(v) => setTrimStart(Math.min(v, trimEnd - .05))} />
          <Range label="Fin" value={trimEnd} min={0} max={Math.max(0, trimMax)} step={0.05} suffix="s" onChange={(v) => setTrimEnd(Math.max(v, trimStart + .05))} />

          <button className="exportBtn" disabled={!canExport} onClick={exportVideo}>
            {exporting ? `Exportando ${progress}%` : "Exportar MP4"}
          </button>
          {exporting && <div className="progress"><div style={{ width: `${progress}%` }} /></div>}
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
            <button onClick={togglePlay} disabled={!videoFile}>{videoRef.current?.paused === false ? "Pausa" : "Play"}</button>
            <input type="range" min={0} max={Math.max(duration, 0)} step="0.01" value={playhead} onChange={(e) => seek(Number(e.target.value))} disabled={!videoFile} />
            <span>{formatTime(playhead)} / {formatTime(duration)}</span>
          </div>
          <p className="localNote">El video y la plantilla se procesan localmente en tu navegador. Vercel solo sirve la web.</p>
        </section>
      </section>

      <video
        ref={videoRef}
        src={videoUrl || undefined}
        onLoadedMetadata={onVideoLoaded}
        onSeeked={() => { setPlayhead(videoRef.current?.currentTime || 0); draw(); }}
        playsInline
        style={{ display: "none" }}
      />
    </main>
  );
}

function Range({ label, value, min, max, step, suffix, onChange }) {
  return (
    <label className="rangeField">
      <div><span>{label}</span><b>{typeof value === "number" ? Number(value.toFixed(2)) : value}{suffix}</b></div>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
