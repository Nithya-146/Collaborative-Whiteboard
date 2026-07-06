// Helper: Calculate distance between two points
export function distance(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// Helper: Distance from point P to line segment AB
export function distanceToSegment(p, a, b) {
  const l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
  if (l2 === 0) return distance(p, a);
  
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  
  const projection = {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y)
  };
  
  return distance(p, projection);
}

// Check if point p intersects with a given element
export function isPointNearElement(p, element, threshold = 8) {
  const { type, x1, y1, x2, y2, points, fillType } = element;
  
  switch (type) {
    case 'pen': {
      if (!points || points.length < 2) return false;
      // Check distance to each segment in the freehand path
      for (let i = 0; i < points.length - 1; i++) {
        if (distanceToSegment(p, points[i], points[i + 1]) <= threshold + element.size / 2) {
          return true;
        }
      }
      return false;
    }
    
    case 'line': {
      return distanceToSegment(p, { x: x1, y: y1 }, { x: x2, y: y2 }) <= threshold + element.size / 2;
    }
    
    case 'rect': {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      
      // If filled (solid or translucent), check if point is inside
      if (fillType !== 'none' && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
        return true;
      }
      
      // Check intersection with the 4 borders
      const top = distanceToSegment(p, { x: minX, y: minY }, { x: maxX, y: minY });
      const right = distanceToSegment(p, { x: maxX, y: minY }, { x: maxX, y: maxY });
      const bottom = distanceToSegment(p, { x: minX, y: maxY }, { x: maxX, y: maxY });
      const left = distanceToSegment(p, { x: minX, y: minY }, { x: minX, y: maxY });
      
      return Math.min(top, right, bottom, left) <= threshold + element.size / 2;
    }
    
    case 'circle': {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      const r = (rx + ry) / 2; // Average radius for simplified collision on circles
      
      const dist = distance(p, { x: cx, y: cy });
      
      if (fillType !== 'none') {
        // If filled, any point inside is a hit
        return dist <= r + threshold;
      } else {
        // If hollow, must be close to the border
        return Math.abs(dist - r) <= threshold + element.size / 2;
      }
    }
    
    default:
      return false;
  }
}

// Convert screen coordinates to canvas world coordinates
export function screenToWorld(clientX, clientY, panOffset, zoom) {
  return {
    x: (clientX - panOffset.x) / zoom,
    y: (clientY - panOffset.y) / zoom
  };
}

// Render a single element onto the 2D canvas context
export function drawElement(ctx, element) {
  ctx.strokeStyle = element.color;
  ctx.lineWidth = element.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const fillStyleMap = {
    solid: element.color,
    translucent: hexToRGBA(element.color, 0.2),
    none: 'transparent'
  };
  
  ctx.fillStyle = fillStyleMap[element.fillType || 'none'] || 'transparent';

  switch (element.type) {
    case 'pen':
      if (!element.points || element.points.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(element.points[0].x, element.points[0].y);
      for (let i = 1; i < element.points.length; i++) {
        ctx.lineTo(element.points[i].x, element.points[i].y);
      }
      ctx.stroke();
      break;

    case 'line':
      ctx.beginPath();
      ctx.moveTo(element.x1, element.y1);
      ctx.lineTo(element.x2, element.y2);
      ctx.stroke();
      break;

    case 'rect': {
      const x = Math.min(element.x1, element.x2);
      const y = Math.min(element.y1, element.y2);
      const w = Math.abs(element.x2 - element.x1);
      const h = Math.abs(element.y2 - element.y1);
      
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      
      if (element.fillType && element.fillType !== 'none') {
        ctx.fill();
      }
      ctx.stroke();
      break;
    }

    case 'circle': {
      const cx = (element.x1 + element.x2) / 2;
      const cy = (element.y1 + element.y2) / 2;
      const rx = Math.abs(element.x2 - element.x1) / 2;
      const ry = Math.abs(element.y2 - element.y1) / 2;
      const r = (rx + ry) / 2; // draw as perfect circle centered
      
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      
      if (element.fillType && element.fillType !== 'none') {
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
  }
}

// Helper: Convert hex color string to RGBA with opacity
function hexToRGBA(hex, alpha = 1) {
  // Check if hex is a valid hex color
  const reg = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  if (!reg.test(hex)) return hex;
  
  let sColor = hex.toLowerCase();
  if (sColor.length === 4) {
    let sColorNew = '#';
    for (let i = 1; i < 4; i += 1) {
      sColorNew += sColor.slice(i, i + 1).concat(sColor.slice(i, i + 1));
    }
    sColor = sColorNew;
  }
  
  const sColorChange = [];
  for (let i = 1; i < 7; i += 2) {
    sColorChange.push(parseInt('0x' + sColor.slice(i, i + 2)));
  }
  
  return `rgba(${sColorChange.join(',')},${alpha})`;
}
