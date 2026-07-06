import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { 
  Pen, Eraser, Square, Circle, Minus, Hand, 
  Undo2, Redo2, Trash2, Download, Copy, Check, 
  Users, Sun, Moon, Sparkles, ChevronRight, CheckSquare 
} from 'lucide-react';
import Whiteboard from './components/Whiteboard';
import CursorOverlay from './components/CursorOverlay';
import { drawElement } from './canvasUtils';

// List of curated pastel colors for user cursors and badges
const CURSOR_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981', 
  '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'
];

const ANIMAL_NAMES = [
  'Creative Fox', 'Sleek Jaguar', 'Artistic Eagle', 'Bold Badger',
  'Crafty Raccoon', 'Swift Falcon', 'Dynamic Dolphin', 'Bright Owl',
  'Clever Beaver', 'Inventive Koala', 'Nimble Cheetah', 'Glow Panda'
];

export default function App() {
  // Room and User states
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [userColor, setUserColor] = useState('');
  const [socket, setSocket] = useState(null);
  const [socketId, setSocketId] = useState('');
  const [connectedUsers, setConnectedUsers] = useState({});
  const [isCopied, setIsCopied] = useState(false);

  // Board State
  const [elements, setElements] = useState([]);
  const [activeDrawings, setActiveDrawings] = useState({}); // other users drawing live
  const [theme, setTheme] = useState('light'); // light or dark board grid

  // Active Tooling State
  const [tool, setTool] = useState('pen'); // pen, line, rect, circle, eraser, select
  const [strokeColor, setStrokeColor] = useState('#1e293b');
  const [strokeSize, setStrokeSize] = useState(3);
  const [fillType, setFillType] = useState('none'); // none, translucent, solid

  // Canvas Transform State (Zoom and Pan)
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // Undo / Redo Stacks (Client-side tracking)
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Initialization: Parse Room & Set Up User
  useEffect(() => {
    // 1. Get or Generate Room ID
    const urlParams = new URLSearchParams(window.location.search);
    let room = urlParams.get('room');
    if (!room) {
      room = Math.random().toString(36).substring(2, 9);
      urlParams.set('room', room);
      window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);
    }
    setRoomId(room);

    // 2. Set Up Username (cached or random)
    let storedName = localStorage.getItem('board_username');
    if (!storedName) {
      storedName = ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)];
      localStorage.setItem('board_username', storedName);
    }
    setUsername(storedName);

    // 3. Set Up Cursor Color (cached or random)
    let storedColor = localStorage.getItem('board_usercolor');
    if (!storedColor) {
      storedColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
      localStorage.setItem('board_usercolor', storedColor);
    }
    setUserColor(storedColor);
  }, []);

  // Socket Connection Setup
  useEffect(() => {
    if (!roomId || !username || !userColor) return;

    // Establish WebSocket Connection
    const targetUrl = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;
    const newSocket = io(targetUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setSocketId(newSocket.id);
      newSocket.emit('join-room', {
        roomId,
        username,
        cursorColor: userColor
      });
    });

    // Handle initial board state on join
    newSocket.on('room-state', ({ elements: initialElements, users }) => {
      setElements(initialElements);
      setConnectedUsers(users);
    });

    // Handle new user joining
    newSocket.on('user-joined', ({ userId, user }) => {
      setConnectedUsers(prev => ({
        ...prev,
        [userId]: user
      }));
    });

    // Handle user leaving
    newSocket.on('user-left', (userId) => {
      setConnectedUsers(prev => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
      setActiveDrawings(prev => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
    });

    // Handle cursor position updates
    newSocket.on('cursor-update', ({ userId, cursor }) => {
      setConnectedUsers(prev => {
        if (!prev[userId]) return prev;
        return {
          ...prev,
          [userId]: {
            ...prev[userId],
            cursor
          }
        };
      });
    });

    // Remote Drawing Events (Live Preview)
    newSocket.on('draw-start-remote', ({ userId, drawingState }) => {
      setActiveDrawings(prev => ({
        ...prev,
        [userId]: drawingState
      }));
    });

    newSocket.on('draw-step-remote', ({ userId, drawingState }) => {
      setActiveDrawings(prev => ({
        ...prev,
        [userId]: drawingState
      }));
    });

    newSocket.on('draw-end-remote', ({ userId }) => {
      setActiveDrawings(prev => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
    });

    // Handle finished elements added by other clients
    newSocket.on('element-added-remote', (element) => {
      setElements(prev => [...prev, element]);
    });

    // Handle elements deleted by other clients
    newSocket.on('elements-deleted-remote', (deletedIds) => {
      setElements(prev => prev.filter(el => !deletedIds.includes(el.id)));
    });

    // Handle element undo/removal
    newSocket.on('element-removed-remote', ({ id, elements: updatedElements }) => {
      setElements(updatedElements);
    });

    // Handle board clear
    newSocket.on('board-cleared-remote', () => {
      setElements([]);
      setActiveDrawings({});
    });

    return () => {
      newSocket.disconnect();
    };
  }, [roomId, username, userColor]);

  // Sync stroke color defaults based on theme
  useEffect(() => {
    if (theme === 'dark' && strokeColor === '#1e293b') {
      setStrokeColor('#f8fafc');
    } else if (theme === 'light' && strokeColor === '#f8fafc') {
      setStrokeColor('#1e293b');
    }
  }, [theme]);

  // Copy Room Link to Clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Undo implementation (User-scoped: reverts user's own last actions)
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    
    // Pop from undo stack
    setUndoStack(prev => prev.slice(0, -1));
    
    if (action.actionType === 'add') {
      // Revert drawing: tell the server to undo the last item belonging to this socketId
      if (socket && socket.connected) {
        socket.emit('undo', { ownerId: socketId });
      }
      // Push to redo stack
      setRedoStack(prev => [...prev, action]);
    } else if (action.actionType === 'delete') {
      // Revert erasing: Add deleted elements back
      const elementsToAdd = action.elements;
      setElements(prev => [...prev, ...elementsToAdd]);
      
      elementsToAdd.forEach(el => {
        if (socket && socket.connected) {
          socket.emit('element-added', el);
        }
      });
      // Push to redo stack
      setRedoStack(prev => [...prev, action]);
    }
  };

  // Redo implementation
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const action = redoStack[redoStack.length - 1];
    
    // Pop from redo stack
    setRedoStack(prev => prev.slice(0, -1));
    
    if (action.actionType === 'add') {
      // Re-add the element
      setElements(prev => [...prev, action.element]);
      if (socket && socket.connected) {
        socket.emit('element-added', action.element);
      }
      setUndoStack(prev => [...prev, action]);
    } else if (action.actionType === 'delete') {
      // Re-delete the elements
      const deleteIds = action.elements.map(el => el.id);
      setElements(prev => prev.filter(el => !deleteIds.includes(el.id)));
      if (socket && socket.connected) {
        socket.emit('elements-deleted', deleteIds);
      }
      setUndoStack(prev => [...prev, action]);
    }
  };

  // Track operations for Undo History
  const addToUndo = (data, actionType = 'add') => {
    setRedoStack([]); // Clear redo stack on new action
    if (actionType === 'add') {
      setUndoStack(prev => [...prev, { actionType, element: data }]);
    } else if (actionType === 'delete') {
      // If we are erasing, we store multiple elements if erased in a single swipe
      const lastUndo = undoStack[undoStack.length - 1];
      if (lastUndo && lastUndo.actionType === 'delete') {
        // Group erases within the same continuous frame if close together
        setUndoStack(prev => {
          const updated = [...prev];
          updated[updated.length - 1].elements.push(data);
          return updated;
        });
      } else {
        setUndoStack(prev => [...prev, { actionType, elements: [data] }]);
      }
    }
  };

  // Clear Board trigger
  const handleClearBoard = () => {
    if (window.confirm('Are you sure you want to clear the entire whiteboard?')) {
      setUndoStack([]);
      setRedoStack([]);
      if (socket && socket.connected) {
        socket.emit('clear-board');
      }
    }
  };

  // Export board elements to PNG with perfect crop bounding box
  const handleExportPNG = () => {
    if (elements.length === 0) {
      alert("Draw something on the whiteboard before exporting!");
      return;
    }

    // Find bounding box containing all drawings
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    elements.forEach(el => {
      if (el.type === 'pen') {
        el.points.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        });
      } else {
        const xStart = Math.min(el.x1, el.x2);
        const xEnd = Math.max(el.x1, el.x2);
        const yStart = Math.min(el.y1, el.y2);
        const yEnd = Math.max(el.y1, el.y2);

        if (xStart < minX) minX = xStart;
        if (yStart < minY) minY = yStart;
        if (xEnd > maxX) maxX = xEnd;
        if (yEnd > maxY) maxY = yEnd;
      }
    });

    // Add extra padding around elements
    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    // Create virtual canvas for export
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportCtx = exportCanvas.getContext('2d');

    // Draw background color (light = white, dark = dark blue)
    exportCtx.fillStyle = theme === 'dark' ? '#0f172a' : '#ffffff';
    exportCtx.fillRect(0, 0, width, height);

    // Render elements offset by bounding box origin
    exportCtx.save();
    exportCtx.translate(-minX, -minY);
    elements.forEach(element => drawElement(exportCtx, element));
    exportCtx.restore();

    // Trigger download
    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  // Quick preset palette selections
  const colorPresets = theme === 'dark' 
    ? ['#f8fafc', '#ef4444', '#f97316', '#34d399', '#38bdf8', '#818cf8', '#f472b6', '#a78bfa']
    : ['#1e293b', '#dc2626', '#ea580c', '#059669', '#0284c7', '#4f46e5', '#db2777', '#7c3aed'];

  return (
    <div className={`w-screen h-screen flex flex-col relative select-none overflow-hidden ${theme === 'dark' ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* Background Grids */}
      <div className={`absolute inset-0 pointer-events-none ${theme === 'dark' ? 'board-grid-dark' : 'board-grid-light'}`} />

      {/* HEADER CONTROLS (Floating Glass Toolbar) */}
      <header className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between pointer-events-none">
        
        {/* Logo and Room Info */}
        <div className="flex items-center gap-3 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-glass border border-slate-200/50 dark:border-slate-800/50 pointer-events-auto">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-md animate-pulse" style={{ animationDuration: '4s' }}>
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-slate-900 dark:text-white flex items-center gap-1.5">
              AetherBoard
              <span className="text-[10px] uppercase tracking-widest bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-mono">v1.0</span>
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">Room: {roomId}</span>
              <button 
                onClick={handleCopyLink}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                title="Copy Room Link"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        {/* Action Controls & Navigation */}
        <div className="flex items-center gap-3 pointer-events-auto">
          {/* Active User Avatars Pile */}
          <div className="flex items-center gap-1 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-3.5 py-2.5 rounded-2xl shadow-glass border border-slate-200/50 dark:border-slate-800/50">
            <Users className="w-4 h-4 text-slate-400 dark:text-slate-500 mr-1" />
            <span className="text-xs font-bold font-mono mr-2">{Object.keys(connectedUsers).length} Active</span>
            <div className="flex -space-x-2.5 overflow-hidden">
              {Object.entries(connectedUsers).slice(0, 4).map(([id, user]) => (
                <div 
                  key={id}
                  className="inline-block h-6.5 w-6.5 rounded-full ring-2 ring-white dark:ring-slate-950 flex items-center justify-center text-[10px] font-black text-white cursor-pointer select-none"
                  style={{ backgroundColor: user.color }}
                  title={`${user.username} (${id === socketId ? 'You' : 'Remote'})`}
                >
                  {user.username.charAt(0).toUpperCase()}
                </div>
              ))}
              {Object.keys(connectedUsers).length > 4 && (
                <div className="flex h-6.5 w-6.5 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-bold ring-2 ring-white dark:ring-slate-950">
                  +{Object.keys(connectedUsers).length - 4}
                </div>
              )}
            </div>
          </div>

          {/* Canvas View Options */}
          <div className="flex items-center bg-white/80 dark:bg-slate-950/80 backdrop-blur-md p-1.5 rounded-2xl shadow-glass border border-slate-200/50 dark:border-slate-800/50">
            {/* Zoom display */}
            <span className="text-[11px] font-mono px-2 font-bold text-slate-500 dark:text-slate-400">
              {Math.round(zoom * 100)}%
            </span>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
            
            {/* Theme Toggle */}
            <button 
              onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
              title="Toggle Theme"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>

          {/* Action Operations Toolbar */}
          <div className="flex items-center gap-1 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md p-1.5 rounded-2xl shadow-glass border border-slate-200/50 dark:border-slate-800/50">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4.5 h-4.5" />
            </button>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-800 mx-1" />
            <button
              onClick={handleClearBoard}
              className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              title="Clear Whiteboard"
            >
              <Trash2 className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={handleExportPNG}
              className="p-2 rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
              title="Export as PNG"
            >
              <Download className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </header>

      {/* DRAWING TOOLBOX (Floating Left Sidebar) */}
      <aside className="absolute left-4 top-28 z-40 flex flex-col gap-4 w-64 pointer-events-none">
        
        {/* Drawing Tools Selector */}
        <div className="bg-white/90 dark:bg-slate-950/90 backdrop-blur-md p-2 rounded-2xl shadow-glass border border-slate-200/50 dark:border-slate-800/50 pointer-events-auto flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2.5 pt-1 pb-0.5">Drawing Tool</span>
          
          <div className="grid grid-cols-3 gap-1">
            {[
              { id: 'pen', label: 'Draw', icon: Pen },
              { id: 'line', label: 'Line', icon: Minus },
              { id: 'rect', label: 'Rect', icon: Square },
              { id: 'circle', label: 'Circle', icon: Circle },
              { id: 'eraser', label: 'Eraser', icon: Eraser },
              { id: 'select', label: 'Pan', icon: Hand }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setTool(item.id)}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-semibold gap-1.5 transition-all ${
                  tool === item.id 
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                    : 'bg-transparent border-slate-200/40 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title={item.label}
              >
                <item.icon className="w-4.5 h-4.5" />
                <span className="text-[10px]">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Stroke / Styling Panel (Only visible if drawing shape/pen) */}
        {tool !== 'eraser' && tool !== 'select' && (
          <div className="bg-white/90 dark:bg-slate-950/90 backdrop-blur-md p-3.5 rounded-2xl shadow-glass border border-slate-200/50 dark:border-slate-800/50 pointer-events-auto flex flex-col gap-3.5 transition-all duration-300">
            
            {/* Color Selection */}
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">Stroke Color</span>
              <div className="grid grid-cols-4 gap-1.5">
                {colorPresets.map(c => (
                  <button
                    key={c}
                    onClick={() => setStrokeColor(c)}
                    className="w-full aspect-square rounded-lg border-2 relative flex items-center justify-center transition-all hover:scale-105"
                    style={{ 
                      backgroundColor: c, 
                      borderColor: strokeColor === c ? '#4f46e5' : 'rgba(0,0,0,0.1)'
                    }}
                  >
                    {strokeColor === c && (
                      <div className="w-2.5 h-2.5 rounded-full bg-white dark:bg-slate-950 border border-slate-300/30" />
                    )}
                  </button>
                ))}
                
                {/* Custom Color Input Picker */}
                <div className="w-full aspect-square rounded-lg border-2 border-slate-200/50 dark:border-slate-800/50 relative overflow-hidden flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer">
                  <input 
                    type="color" 
                    value={strokeColor} 
                    onChange={(e) => setStrokeColor(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-4 h-4 rounded-full bg-conic-gradient border border-slate-350/50" 
                    style={{ backgroundImage: 'conic-gradient(red, yellow, green, cyan, blue, magenta, red)' }} 
                  />
                </div>
              </div>
            </div>

            {/* Stroke Thickness Slider */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Thickness</span>
                <span className="text-xs font-semibold text-slate-500">{strokeSize}px</span>
              </div>
              <div className="flex gap-2">
                {[1, 3, 5, 8].map(sz => (
                  <button
                    key={sz}
                    onClick={() => setStrokeSize(sz)}
                    className={`flex-1 py-1 text-xs font-bold rounded-lg border transition-all ${
                      strokeSize === sz 
                        ? 'bg-slate-200 dark:bg-slate-800 border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                        : 'border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'
                    }`}
                  >
                    {sz === 1 ? 'Thin' : sz === 3 ? 'Medium' : sz === 5 ? 'Thick' : 'Heavy'}
                  </button>
                ))}
              </div>
            </div>

            {/* Fill Mode Controls (Only visible for geometric shapes) */}
            {tool !== 'pen' && (
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">Shape Fill</span>
                <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl">
                  {[
                    { id: 'none', label: 'Hollow' },
                    { id: 'translucent', label: 'Trans' },
                    { id: 'solid', label: 'Solid' }
                  ].map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => setFillType(mode.id)}
                      className={`flex-1 py-1 rounded-lg text-xs font-medium transition-all ${
                        fillType === mode.id 
                          ? 'bg-white dark:bg-slate-850 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold' 
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* USER INITIALS & COLOR EDIT CARD (Bottom Left Indicator) */}
      <footer className="absolute bottom-4 left-4 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-glass border border-slate-200/50 dark:border-slate-800/50 flex items-center gap-3">
        <div 
          className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-md cursor-pointer hover:rotate-6 transition-transform"
          style={{ backgroundColor: userColor }}
          onClick={() => {
            const newCol = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
            setUserColor(newCol);
            localStorage.setItem('board_usercolor', newCol);
          }}
          title="Click to randomize your color"
        >
          {username.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold leading-none">{username}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <span className="text-[10px] text-slate-450 dark:text-slate-500 block mt-0.5 leading-none">You (Collaborator)</span>
        </div>
      </footer>

      {/* THE MAIN WHITEBOARD CANVAS COMPONENT */}
      <main className="w-full h-full flex-grow relative z-10">
        <Whiteboard
          elements={elements}
          setElements={setElements}
          activeDrawings={activeDrawings}
          tool={tool}
          color={strokeColor}
          size={strokeSize}
          fillType={fillType}
          socket={socket}
          ownerId={socketId}
          zoom={zoom}
          setZoom={setZoom}
          panOffset={panOffset}
          setPanOffset={setPanOffset}
          addToUndo={addToUndo}
        />

        {/* Butter Smooth Floating Cursor Overlay */}
        <CursorOverlay
          users={connectedUsers}
          currentUserId={socketId}
          zoom={zoom}
          panOffset={panOffset}
        />
      </main>

    </div>
  );
}
