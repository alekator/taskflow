"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getTaskRoadmap,
  updateTaskRoadmap,
  type TaskRoadmapData,
  type TaskRoadmapElement,
} from "../../lib/tasks/api";
import { getErrorDetails } from "../../lib/errors";

type Tool = "select" | "pan" | "pen" | "rect" | "arrow" | "text";

type Drag =
  | { mode: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { mode: "pen"; id: string }
  | { mode: "rect" | "arrow"; id: string; x: number; y: number }
  | { mode: "move"; id: string; x: number; y: number }
  | { mode: "resize"; id: string; x: number; y: number }
  | null;

type TextEditor = { id: string; value: string; left: number; top: number } | null;

const GRID = 120;
const SAVE_MS = 900;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.4;
const IMAGE_MAX_EDGE = 1600;
const IMAGE_JPEG_QUALITY = 0.82;

const id = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function baseDoc(taskId: string): TaskRoadmapData {
  return { version: 1, taskId, viewport: { x: 0, y: 0, zoom: 1 }, elements: [] };
}

function bounds(el: TaskRoadmapElement) {
  if (el.type === "rect" || el.type === "image") return { x: el.x, y: el.y, w: Math.max(1, el.width ?? 1), h: Math.max(1, el.height ?? 1) };
  if (el.type === "arrow") {
    const tx = el.toX ?? el.x;
    const ty = el.toY ?? el.y;
    return { x: Math.min(el.x, tx), y: Math.min(el.y, ty), w: Math.abs(tx - el.x) || 1, h: Math.abs(ty - el.y) || 1 };
  }
  if (el.type === "path" && el.points?.length) {
    const xs = el.points.map((p) => p.x);
    const ys = el.points.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(1, Math.max(...xs) - Math.min(...xs)), h: Math.max(1, Math.max(...ys) - Math.min(...ys)) };
  }
  return { x: el.x, y: el.y - 18, w: Math.max(40, (el.text?.length ?? 4) * 8), h: 24 };
}

function distSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hit(el: TaskRoadmapElement, x: number, y: number, tol: number) {
  if (el.type === "rect" || el.type === "image" || el.type === "text") {
    const b = bounds(el);
    return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
  }
  if (el.type === "arrow") {
    return distSeg(x, y, el.x, el.y, el.toX ?? el.x, el.toY ?? el.y) <= tol;
  }
  if (el.type === "path" && el.points && el.points.length > 1) {
    for (let i = 1; i < el.points.length; i += 1) {
      const prev = el.points[i - 1];
      const curr = el.points[i];
      if (!prev || !curr) continue;
      if (distSeg(x, y, prev.x, prev.y, curr.x, curr.y) <= tol) return true;
    }
  }
  return false;
}

async function optimizeImageFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to read image"));
      img.src = objectUrl;
    });

    const srcW = Math.max(1, image.naturalWidth || image.width);
    const srcH = Math.max(1, image.naturalHeight || image.height);
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to process image");

    ctx.drawImage(image, 0, 0, width, height);

    if (file.type === "image/png") {
      return canvas.toDataURL("image/png");
    }
    return canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function TaskRoadmapPanel({ taskId }: { taskId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imgsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const dragRef = useRef<Drag>(null);
  const timerRef = useRef<number | null>(null);
  const saveTokenRef = useRef(0);
  const docRef = useRef<TaskRoadmapData>(baseDoc(taskId));

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [doc, setDoc] = useState<TaskRoadmapData>(baseDoc(taskId));
  const [selected, setSelected] = useState<string | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditor>(null);
  const [stroke, setStroke] = useState("#ca663a");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  docRef.current = doc;

  const setDocSafe = useCallback(
    (updater: (prev: TaskRoadmapData) => TaskRoadmapData) => {
      setDoc((prev) => {
        const next = updater(prev);
        docRef.current = next;
        return next;
      });
    },
    [],
  );

  const screen = useCallback((x: number, y: number) => ({
    x: x * docRef.current.viewport.zoom + docRef.current.viewport.x,
    y: y * docRef.current.viewport.zoom + docRef.current.viewport.y,
  }), []);
  const world = useCallback((cx: number, cy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: (cx - r.left - docRef.current.viewport.x) / docRef.current.viewport.zoom,
      y: (cy - r.top - docRef.current.viewport.y) / docRef.current.viewport.zoom,
    };
  }, []);

  const saveSoon = useCallback((next: TaskRoadmapData) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      const token = ++saveTokenRef.current;
      try {
        setSaving(true);
        const res = await updateTaskRoadmap(taskId, { ...next, version: next.version + 1 });
        if (token !== saveTokenRef.current) return;
        setDocSafe((prev) => ({
          ...prev,
          version: Math.max(prev.version, res.data.version),
        }));
        setSavedAt(res.updatedAt);
      } catch (e) {
        setError(getErrorDetails(e).message);
      } finally {
        if (token === saveTokenRef.current) {
          setSaving(false);
        }
      }
    }, SAVE_MS);
  }, [setDocSafe, taskId]);

  const patchDoc = useCallback((fn: (d: TaskRoadmapData) => TaskRoadmapData, persist = true) => {
    setDocSafe((prev) => {
      const next = fn(prev);
      if (persist) saveSoon(next);
      return next;
    });
  }, [saveSoon, setDocSafe]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getTaskRoadmap(taskId);
        setDocSafe(() => res.data);
        setSavedAt(res.updatedAt);
      } catch (e) {
        setError(getErrorDetails(e).message);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [open, setDocSafe, taskId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    const sx = (x: number) => x * doc.viewport.zoom + doc.viewport.x;
    const sy = (y: number) => y * doc.viewport.zoom + doc.viewport.y;

    const draw = () => {
      const w = shell.clientWidth;
      const h = shell.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const step = GRID * doc.viewport.zoom;
      ctx.strokeStyle = "rgba(32,38,49,.08)";
      ctx.lineWidth = 1;
      for (let x = ((doc.viewport.x % step) + step) % step; x <= w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = ((doc.viewport.y % step) + step) % step; y <= h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      const arrowHead = (x1: number, y1: number, x2: number, y2: number, color: string, width: number) => {
        const a = Math.atan2(y2 - y1, x2 - x1);
        const sz = Math.max(8, width * 3);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - sz * Math.cos(a - Math.PI / 6), y2 - sz * Math.sin(a - Math.PI / 6));
        ctx.lineTo(x2 - sz * Math.cos(a + Math.PI / 6), y2 - sz * Math.sin(a + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      };

      doc.elements.forEach((el) => {
        const color = el.stroke ?? "#202631";
        const width = Math.max(1, (el.strokeWidth ?? 2) * doc.viewport.zoom);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (el.type === "path" && el.points && el.points.length > 1) {
          ctx.beginPath();
          el.points.forEach((p, i) => i === 0 ? ctx.moveTo(sx(p.x), sy(p.y)) : ctx.lineTo(sx(p.x), sy(p.y)));
          ctx.stroke();
        } else if (el.type === "rect") {
          ctx.strokeRect(sx(el.x), sy(el.y), (el.width ?? 1) * doc.viewport.zoom, (el.height ?? 1) * doc.viewport.zoom);
        } else if (el.type === "arrow") {
          const tx = el.toX ?? el.x;
          const ty = el.toY ?? el.y;
          ctx.beginPath(); ctx.moveTo(sx(el.x), sy(el.y)); ctx.lineTo(sx(tx), sy(ty)); ctx.stroke();
          arrowHead(sx(el.x), sy(el.y), sx(tx), sy(ty), color, width);
        } else if (el.type === "text") {
          ctx.font = `${Math.max(12, (el.fontSize ?? 18) * doc.viewport.zoom)}px var(--font-body)`;
          ctx.fillText(el.text ?? "", sx(el.x), sy(el.y));
        } else if (el.type === "image" && el.imageDataUrl) {
          const cached = imgsRef.current.get(el.imageDataUrl);
          if (cached && cached.complete) {
            ctx.drawImage(cached, sx(el.x), sy(el.y), (el.width ?? 320) * doc.viewport.zoom, (el.height ?? 180) * doc.viewport.zoom);
          } else {
            const im = new Image();
            im.src = el.imageDataUrl;
            im.onload = () => { imgsRef.current.set(el.imageDataUrl as string, im); draw(); };
            imgsRef.current.set(el.imageDataUrl, im);
          }
        }

        if (selected === el.id) {
          const b = bounds(el);
          ctx.save();
          ctx.strokeStyle = "rgba(202,102,58,.95)";
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 1.5;
          ctx.strokeRect(sx(b.x), sy(b.y), b.w * doc.viewport.zoom, b.h * doc.viewport.zoom);
          ctx.setLineDash([]);
          if (el.type === "rect" || el.type === "image") {
            const hx = sx(b.x + b.w);
            const hy = sy(b.y + b.h);
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = "rgba(202,102,58,1)";
            ctx.fillRect(hx - 4, hy - 4, 8, 8);
            ctx.strokeRect(hx - 4, hy - 4, 8, 8);
          }
          ctx.restore();
        }
      });
    };

    const ro = new ResizeObserver(draw);
    ro.observe(shell);
    draw();
    return () => ro.disconnect();
  }, [doc, selected]);

  useEffect(() => {
    const mini = miniRef.current;
    if (!mini) return;
    const ctx = mini.getContext("2d");
    if (!ctx) return;
    const w = mini.clientWidth;
    const h = mini.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    mini.width = Math.floor(w * dpr);
    mini.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const all = doc.elements.length ? doc.elements.map(bounds) : [{ x: -300, y: -180, w: 600, h: 360 }];
    const minX = Math.min(...all.map((b) => b.x));
    const minY = Math.min(...all.map((b) => b.y));
    const maxX = Math.max(...all.map((b) => b.x + b.w));
    const maxY = Math.max(...all.map((b) => b.y + b.h));
    const ww = Math.max(600, maxX - minX);
    const hh = Math.max(360, maxY - minY);
    const sc = Math.min((w - 18) / ww, (h - 18) / hh);
    const ox = (w - ww * sc) / 2 - minX * sc;
    const oy = (h - hh * sc) / 2 - minY * sc;
    const px = (x: number) => x * sc + ox;
    const py = (y: number) => y * sc + oy;

    ctx.fillStyle = "rgba(17,20,15,.04)";
    ctx.fillRect(0, 0, w, h);
    doc.elements.forEach((el) => {
      const b = bounds(el);
      ctx.fillStyle = "rgba(32,38,49,.2)";
      ctx.fillRect(px(b.x), py(b.y), Math.max(2, b.w * sc), Math.max(2, b.h * sc));
    });

    const c = canvasRef.current;
    if (c) {
      const vx = -doc.viewport.x / doc.viewport.zoom;
      const vy = -doc.viewport.y / doc.viewport.zoom;
      const vw = c.clientWidth / doc.viewport.zoom;
      const vh = c.clientHeight / doc.viewport.zoom;
      ctx.strokeStyle = "rgba(202,102,58,.95)";
      ctx.lineWidth = 1.3;
      ctx.strokeRect(px(vx), py(vy), Math.max(3, vw * sc), Math.max(3, vh * sc));
    }
  }, [doc]);

  const findTop = useCallback((x: number, y: number) => {
    const tol = 9 / docRef.current.viewport.zoom;
    for (let i = docRef.current.elements.length - 1; i >= 0; i -= 1) {
      const el = docRef.current.elements[i];
      if (!el) continue;
      if (hit(el, x, y, tol)) return el;
    }
    return null;
  }, []);

  const onDown: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    if (loading) return;
    const p = world(e.clientX, e.clientY);
    const d = docRef.current;

    if (tool === "text") {
      const t = window.prompt("Text", "New note");
      if (!t) return;
      patchDoc((prev) => ({ ...prev, elements: [...prev.elements, { id: id("txt"), type: "text", x: p.x, y: p.y, text: t, fontSize: 18, stroke }] }));
      return;
    }

    if (tool === "pan" || e.button === 1) {
      dragRef.current = { mode: "pan", sx: e.clientX, sy: e.clientY, ox: d.viewport.x, oy: d.viewport.y };
      return;
    }

    if (tool === "select") {
      const el = findTop(p.x, p.y);
      setSelected(el?.id ?? null);
      setTextEditor(null);
      if (!el) return;
      if ((el.type === "rect" || el.type === "image")) {
        const b = bounds(el);
        const tol = 10 / d.viewport.zoom;
        if (Math.abs(p.x - (b.x + b.w)) <= tol && Math.abs(p.y - (b.y + b.h)) <= tol) {
          dragRef.current = { mode: "resize", id: el.id, x: b.x, y: b.y };
          return;
        }
      }
      dragRef.current = { mode: "move", id: el.id, x: p.x, y: p.y };
      return;
    }

    if (tool === "pen") {
      const eid = id("path");
      dragRef.current = { mode: "pen", id: eid };
      setSelected(eid);
      setDocSafe((prev) => ({ ...prev, elements: [...prev.elements, { id: eid, type: "path", x: p.x, y: p.y, points: [p], stroke, strokeWidth }] }));
      return;
    }

    if (tool === "rect" || tool === "arrow") {
      const eid = id(tool);
      dragRef.current = { mode: tool, id: eid, x: p.x, y: p.y };
      setSelected(eid);
      setDocSafe((prev) => ({
        ...prev,
        elements: [...prev.elements, tool === "rect"
          ? { id: eid, type: "rect", x: p.x, y: p.y, width: 1, height: 1, stroke, strokeWidth }
          : { id: eid, type: "arrow", x: p.x, y: p.y, toX: p.x, toY: p.y, stroke, strokeWidth }],
      }));
    }
  };

  const onMove: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    const st = dragRef.current;
    if (!st) return;
    const p = world(e.clientX, e.clientY);

    if (st.mode === "pan") {
      setDocSafe((prev) => ({ ...prev, viewport: { ...prev.viewport, x: st.ox + (e.clientX - st.sx), y: st.oy + (e.clientY - st.sy) } }));
      return;
    }
    if (st.mode === "pen") {
      setDocSafe((prev) => ({ ...prev, elements: prev.elements.map((el) => el.id === st.id && el.type === "path" ? { ...el, points: [...(el.points ?? []), p] } : el) }));
      return;
    }
    if (st.mode === "rect") {
      setDocSafe((prev) => ({ ...prev, elements: prev.elements.map((el) => el.id === st.id && el.type === "rect" ? { ...el, x: Math.min(st.x, p.x), y: Math.min(st.y, p.y), width: Math.abs(p.x - st.x), height: Math.abs(p.y - st.y) } : el) }));
      return;
    }
    if (st.mode === "arrow") {
      setDocSafe((prev) => ({ ...prev, elements: prev.elements.map((el) => el.id === st.id && el.type === "arrow" ? { ...el, toX: p.x, toY: p.y } : el) }));
      return;
    }
    if (st.mode === "move") {
      const dx = p.x - st.x;
      const dy = p.y - st.y;
      dragRef.current = { ...st, x: p.x, y: p.y };
      setDocSafe((prev) => ({
        ...prev,
        elements: prev.elements.map((el) => {
          if (el.id !== st.id) return el;
          if (el.type === "path") return { ...el, x: el.x + dx, y: el.y + dy, points: (el.points ?? []).map((pp) => ({ x: pp.x + dx, y: pp.y + dy })) };
          if (el.type === "arrow") return { ...el, x: el.x + dx, y: el.y + dy, toX: (el.toX ?? el.x) + dx, toY: (el.toY ?? el.y) + dy };
          return { ...el, x: el.x + dx, y: el.y + dy };
        }),
      }));
      return;
    }
    if (st.mode === "resize") {
      setDocSafe((prev) => ({
        ...prev,
        elements: prev.elements.map((el) => el.id === st.id && (el.type === "rect" || el.type === "image")
          ? { ...el, x: st.x, y: st.y, width: Math.max(20, p.x - st.x), height: Math.max(20, p.y - st.y) }
          : el),
      }));
    }
  };

  const onUp: React.PointerEventHandler<HTMLCanvasElement> = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    saveSoon(docRef.current);
  };

  const onDouble: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    const p = world(e.clientX, e.clientY);
    const el = findTop(p.x, p.y);
    if (!el || el.type !== "text") return;
    setSelected(el.id);
    const s = screen(el.x, el.y);
    setTextEditor({ id: el.id, value: el.text ?? "", left: s.x, top: s.y });
  };

  const commitText = () => {
    if (!textEditor) return;
    const v = textEditor.value.trim();
    if (!v) {
      patchDoc((prev) => ({ ...prev, elements: prev.elements.filter((el) => el.id !== textEditor.id) }));
      setSelected(null);
      setTextEditor(null);
      return;
    }
    patchDoc((prev) => ({ ...prev, elements: prev.elements.map((el) => el.id === textEditor.id && el.type === "text" ? { ...el, text: v } : el) }));
    setTextEditor(null);
  };

  const onWheel: React.WheelEventHandler<HTMLCanvasElement> = (e) => {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    setDocSafe((prev) => {
      const z = clamp(prev.viewport.zoom * (e.deltaY < 0 ? 1.08 : 0.92), ZOOM_MIN, ZOOM_MAX);
      const k = z / prev.viewport.zoom;
      return { ...prev, viewport: { x: cx - (cx - prev.viewport.x) * k, y: cy - (cy - prev.viewport.y) * k, zoom: z } };
    });
  };

  const uploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      const dataUrl = await optimizeImageFile(file);
      setError(null);

      patchDoc((prev) => {
        const cx = (-prev.viewport.x + 460) / prev.viewport.zoom;
        const cy = (-prev.viewport.y + 280) / prev.viewport.zoom;
        return { ...prev, elements: [...prev.elements, { id: id("img"), type: "image", x: cx - 180, y: cy - 100, width: 360, height: 200, imageDataUrl: dataUrl }] };
      });
    } catch (err) {
      setError(getErrorDetails(err).message);
    } finally {
      e.target.value = "";
    }
  };

  const clear = () => {
    if (!window.confirm("Clear roadmap canvas for this task?")) return;
    patchDoc((prev) => ({ ...prev, elements: [] }));
    setSelected(null);
    setTextEditor(null);
  };

  const deleteSelected = () => {
    if (!selected) return;
    patchDoc((prev) => ({ ...prev, elements: prev.elements.filter((el) => el.id !== selected) }));
    setSelected(null);
  };

  const summary = useMemo(() => {
    const status = saving ? "Saving..." : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : "Not saved yet";
    return { count: doc.elements.length, status };
  }, [doc.elements.length, savedAt, saving]);

  return (
    <section className="item-card task-roadmap-panel">
      <button className="task-roadmap-toggle" type="button" onClick={() => setOpen((v) => !v)}>
        <div>
          <strong>Road map</strong>
          <p className="soft">{open ? "Shared board for diagrams and notes." : "Click to open infinite canvas for this task"}</p>
        </div>
        <div className="task-roadmap-toggle-meta">
          <span className="badge badge-neutral">{summary.count} items</span>
          <span className="meta">{summary.status}</span>
        </div>
      </button>

      {open ? (
        <div className="task-roadmap-workspace">
          <div className="task-roadmap-toolbar">
            <div className="task-roadmap-tools">
              {(["select", "pan", "pen", "rect", "arrow", "text"] as Tool[]).map((t) => (
                <button key={t} type="button" className={`button button-ghost button-compact${tool === t ? " task-roadmap-tool-active" : ""}`} onClick={() => { setTool(t); setTextEditor(null); }}>
                  {t}
                </button>
              ))}
              <button type="button" className="button button-ghost button-compact" onClick={() => fileRef.current?.click()}>image</button>
              <button type="button" className="button button-ghost button-compact" disabled={!selected} onClick={deleteSelected}>delete</button>
              <input ref={fileRef} className="hidden" type="file" accept="image/*" onChange={uploadImage} />
            </div>

            <div className="task-roadmap-toolbar-settings">
              <label className="task-roadmap-color-label">Color
                <input type="color" value={stroke} onChange={(e) => setStroke(e.target.value)} />
              </label>
              <label className="task-roadmap-width-label">Width
                <input type="range" min={1} max={8} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} />
              </label>
              <button type="button" className="button button-ghost button-compact" onClick={clear}>clear</button>
            </div>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
          {loading ? (
            <div className="stack"><div className="skeleton skeleton-lg" /><div className="skeleton" /></div>
          ) : (
            <div ref={shellRef} className="task-roadmap-canvas-shell">
              <canvas
                ref={canvasRef}
                className={`task-roadmap-canvas task-roadmap-canvas-${tool}`}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerLeave={onUp}
                onDoubleClick={onDouble}
                onWheel={onWheel}
              />

              <aside className="task-roadmap-minimap">
                <div className="task-roadmap-minimap-head"><span className="meta">Minimap</span><span className="meta">{Math.round(doc.viewport.zoom * 100)}%</span></div>
                <canvas ref={miniRef} className="task-roadmap-minimap-canvas" />
              </aside>

              {textEditor ? (
                <div className="task-roadmap-text-editor" style={{ left: `${textEditor.left}px`, top: `${textEditor.top}px` }}>
                  <textarea value={textEditor.value} onChange={(e) => setTextEditor((prev) => prev ? { ...prev, value: e.target.value } : prev)} rows={4} autoFocus />
                  <div className="task-roadmap-text-editor-actions">
                    <button className="button button-ghost button-compact" type="button" onClick={() => setTextEditor(null)}>Cancel</button>
                    <button className="button button-primary button-compact" type="button" onClick={commitText}>Save</button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div className="task-roadmap-footnote">
            <span className="meta">Pro mode: select/move objects, resize shape/image corners, inline text edit and minimap viewport.</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
