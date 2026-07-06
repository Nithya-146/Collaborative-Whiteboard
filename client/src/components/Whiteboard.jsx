import React, { useRef, useEffect, useState } from 'react';
import { screenToWorld, drawElement, isPointNearElement } from '../canvasUtils';

export default function Whiteboard({
  elements,
  setElements,
  activeDrawings,
  tool,
  color,
  size,
  fillType,
  socket,
  ownerId,
  zoom,
  setZoom,
  panOffset,
  setPanOffset,
  addToUndo
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  
  // Ref to track local drawing in progress to avoid state lag in event listeners
  const currentDrawingRef = useRef(null);
  const panStartRef = useRef({ x: 0, y: 0 });
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  
  // Animation frame request refs
  const emitThrottleRef = useRef(null);
  const drawRequestRef = useRef(null);

  // 1. High-DPI canvas resizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      requestDraw();
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial sizing

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 2. Redraw trigger on state changes
  useEffect(() => {
    requestDraw();
  }, [elements, activeDrawings, zoom, panOffset, isDrawing]);

  // Canvas drawing runner
  const requestDraw = () => {
    if (drawRequestRef.current) cancelAnimationFrame(drawRequestRef.current);
    
    drawRequestRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw grid background based on theme (light mode here)
      ctx.save();
      // We draw the grid inside the coordinate space of the canvas
      ctx.restore();

      ctx.save();
      // Apply panning and zoom
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoom, zoom);
      
      // Draw completed elements
      elements.forEach(element => drawElement(ctx, element));
      
      // Draw other users' active drawings
      Object.values(activeDrawings).forEach(drawing => {
        if (drawing) drawElement(ctx, drawing);
      });
      
      // Draw current user's local drawing in progress
      if (currentDrawingRef.current) {
        drawElement(ctx, currentDrawingRef.current);
      }
      
      ctx.restore();
    });
  };

  // Throttle cursor/drawing coordinates emission
  const throttleEmit = (eventName, data) => {
    if (emitThrottleRef.current) return;
    
    emitThrottleRef.current = setTimeout(() => {
      if (socket && socket.connected) {
        socket.emit(eventName, data);
      }
      emitThrottleRef.current = null;
    }, 16); // ~60fps throttling
  };

  // Coordinate capture helper
  const getCoords = (e) => {
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      screenX: clientX - rect.left,
      screenY: clientY - rect.top,
      clientX: clientX - rect.left,
      clientY: clientY - rect.top
    };
  };

  // Mouse / Touch Event Handlers
  const handleDown = (e) => {
    // If middle click or spacebar is held down or select/pan tool is active, start panning
    const isMiddleClick = e.button === 1;
    const isPanTool = tool === 'select';
    const forcePan = isMiddleClick || isPanTool || e.spaceKey;

    const { clientX, clientY } = getCoords(e);
    lastMousePosRef.current = { x: clientX, y: clientY };

    if (forcePan) {
      setIsPanning(true);
      panStartRef.current = {
        x: clientX - panOffset.x,
        y: clientY - panOffset.y
      };
      return;
    }

    const worldPoint = screenToWorld(clientX, clientY, panOffset, zoom);
    
    if (tool === 'eraser') {
      setIsDrawing(true);
      // Delete any intersecting elements immediately on click
      eraseAtPoint(worldPoint);
      return;
    }

    // Start drawing a shape or freehand line
    setIsDrawing(true);
    const elementId = `${ownerId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let newElement;
    if (tool === 'pen') {
      newElement = {
        id: elementId,
        type: 'pen',
        points: [worldPoint],
        color,
        size,
        fillType: 'none',
        ownerId
      };
    } else {
      // Shapes (line, rect, circle)
      newElement = {
        id: elementId,
        type: tool,
        x1: worldPoint.x,
        y1: worldPoint.y,
        x2: worldPoint.x,
        y2: worldPoint.y,
        color,
        size,
        fillType,
        ownerId
      };
    }

    currentDrawingRef.current = newElement;
    if (socket && socket.connected) {
      socket.emit('draw-start', newElement);
    }
    requestDraw();
  };

  const handleMove = (e) => {
    const { clientX, clientY } = getCoords(e);
    const worldPoint = screenToWorld(clientX, clientY, panOffset, zoom);

    // Throttle remote cursor position update
    throttleEmit('cursor-move', { x: worldPoint.x, y: worldPoint.y });

    if (isPanning) {
      setPanOffset({
        x: clientX - panStartRef.current.x,
        y: clientY - panStartRef.current.y
      });
      return;
    }

    if (!isDrawing) return;

    if (tool === 'eraser') {
      eraseAtPoint(worldPoint);
      return;
    }

    // Update active drawing coordinates
    const drawing = currentDrawingRef.current;
    if (!drawing) return;

    if (tool === 'pen') {
      // Append point only if it is sufficiently far from the last point to optimize path storage
      const pts = drawing.points;
      const lastPt = pts[pts.length - 1];
      const dist = Math.hypot(worldPoint.x - lastPt.x, worldPoint.y - lastPt.y);
      
      if (dist > 1.5) {
        drawing.points = [...pts, worldPoint];
        if (socket && socket.connected) {
          socket.emit('draw-step', drawing);
        }
      }
    } else {
      // Shapes
      drawing.x2 = worldPoint.x;
      drawing.y2 = worldPoint.y;
      if (socket && socket.connected) {
        socket.emit('draw-step', drawing);
      }
    }
    
    requestDraw();
  };

  const handleUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    if (tool === 'eraser') {
      return;
    }

    const finalizedElement = currentDrawingRef.current;
    currentDrawingRef.current = null;

    if (socket && socket.connected) {
      socket.emit('draw-end');
    }

    // Validate and save drawing
    if (finalizedElement) {
      // Avoid saving empty lines/dots for shapes
      let isValid = true;
      if (finalizedElement.type === 'pen' && finalizedElement.points.length < 2) {
        isValid = false;
      } else if (
        ['rect', 'circle', 'line'].includes(finalizedElement.type) &&
        finalizedElement.x1 === finalizedElement.x2 &&
        finalizedElement.y1 === finalizedElement.y2
      ) {
        isValid = false;
      }

      if (isValid) {
        setElements(prev => [...prev, finalizedElement]);
        addToUndo(finalizedElement);
        if (socket && socket.connected) {
          socket.emit('element-added', finalizedElement);
        }
      }
    }

    requestDraw();
  };

  // Helper: Erase elements intersecting with the given world point
  const eraseAtPoint = (worldPoint) => {
    const hitElements = elements.filter(el => isPointNearElement(worldPoint, el, 12));
    
    if (hitElements.length > 0) {
      const hitIds = hitElements.map(el => el.id);
      
      // Update elements state locally
      setElements(prev => prev.filter(el => !hitIds.includes(el.id)));
      
      // Track erased elements for undo
      hitElements.forEach(el => addToUndo(el, 'delete'));
      
      // Emit erasure
      if (socket && socket.connected) {
        socket.emit('elements-deleted', hitIds);
      }
    }
  };

  // Mouse wheel zoom support
  const handleWheel = (e) => {
    e.preventDefault();
    const { clientX, clientY } = getCoords(e);
    
    // Zoom factor multiplier
    const zoomIntensity = 0.05;
    const delta = -e.deltaY;
    const factor = delta > 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);
    
    const newZoom = Math.max(0.1, Math.min(10, zoom * factor));
    
    // Zoom to cursor coordinates logic
    const worldPoint = screenToWorld(clientX, clientY, panOffset, zoom);
    
    setPanOffset({
      x: clientX - worldPoint.x * newZoom,
      y: clientY - worldPoint.y * newZoom
    });
    setZoom(newZoom);
  };

  // Handle key listeners (e.g. Spacebar check for panning)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        canvasRef.current.spaceKey = true;
      }
    };
    
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        canvasRef.current.spaceKey = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative cursor-crosshair overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
        onTouchStart={handleDown}
        onTouchMove={handleMove}
        onTouchEnd={handleUp}
        onWheel={handleWheel}
        className="block bg-transparent"
      />
    </div>
  );
}
