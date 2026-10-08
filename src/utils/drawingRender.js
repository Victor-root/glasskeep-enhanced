/* ─── Smooth path rendering (quadratic Bezier interpolation) ─── */
export function drawSmoothPath(ctx, points) {
  if (points.length < 2) {
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      if (i === points.length - 2) {
        ctx.lineTo(p1.x, p1.y);
      } else {
        const mx = (p0.x + p1.x) / 2;
        const my = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
      }
    }
  }

  ctx.stroke();
}

/* ─── Render all paths on a canvas context (shared by DrawingCanvas + DrawingPreview) ─── */
export function renderPaths(ctx, paths, scale = 1) {
  paths.forEach(path => {
    if (!path.points || path.points.length === 0) return;
    // Skip legacy eraser strokes (stroke-based eraser doesn't render anything)
    if (path.tool === 'eraser') return;

    ctx.strokeStyle = path.color;
    ctx.fillStyle = path.color;
    ctx.lineWidth = Math.max(1, path.size * scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';

    const scaledPoints = scale !== 1
      ? path.points.map(p => ({ x: p.x * scale, y: p.y * scale }))
      : path.points;

    drawSmoothPath(ctx, scaledPoints);
  });
}
