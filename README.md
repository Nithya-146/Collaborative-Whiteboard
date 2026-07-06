# 🎨 AetherBoard — Collaborative Real-Time Whiteboard App

AetherBoard is a multi-user, real-time collaborative drawing board built from scratch. Every stroke, shape, and cursor movement appears instantly for all connected users in a room. Like Excalidraw, designed for smooth brainstorming, sketching, and remote collaboration.

👉 **GitHub Repository**: [https://github.com/Nithya-146/Collaborative-Whiteboard](https://github.com/Nithya-146/Collaborative-Whiteboard)  
🔗 **Live Website Link**: *[Insert Live Deployment Link Here]*

---

## ✨ Features

- **⚡ Real-Time Collaboration**: Cursor positions, shapes, and active drawing actions sync instantly across all clients using WebSocket connections.
- **✏️ Interactive Drawing Tools**:
  - **Pen**: Freehand drawing with optimized coordinate points path mapping.
  - **Shapes**: Draw perfect lines, rectangles, and circles.
  - **Eraser**: A vector-based element eraser that automatically detects line/shape intersections and deletes entire elements.
- **🎨 Custom Styling Panel**:
  - Multiple curated color presets + custom HTML5 color picker.
  - Stroke thickness configurations (Thin, Medium, Thick, Heavy).
  - Shape fills (Hollow, Semi-transparent Translucent, Solid).
- **🔍 Pan & Zoom Controls**:
  - Spacebar + Drag (or Pan tool) to slide across an infinite-style canvas.
  - Trackpad gesture / mouse wheel scroll to zoom centered on the cursor position.
- **🛠️ Utilities**:
  - **Undo & Redo**: Local history tracking (user-scoped to undo only your own drawings or deletions).
  - **Clear Canvas**: Instantly wipe the board.
  - **Export to PNG**: Crops and exports the drawn region using elements' bounding boxes with a transparent or solid theme-matching background.
- **👥 Active Rooms & Avatars**:
  - Unique shareable Room IDs in the URL.
  - Dynamic user avatar pile displaying active participant count.
  - Automatic, fun username and avatar color assignments.
- **🌓 Dark Mode**: Toggle between light and dark canvas grids for comfortable workspace drawing.

---

## 🛠️ Tech Stack

- **Frontend**: React (Vite), TailwindCSS, Lucide Icons, HTML5 Canvas 2D API.
- **Backend**: Node.js, Express, Socket.io (WebSocket).
- **Communication**: Socket.io-client.

---

## 🚀 Getting Started

Follow these steps to run the client and server locally:

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v16+ recommended).

### 2. Clone the Repository
```bash
git clone https://github.com/Nithya-146/Collaborative-Whiteboard.git
cd Collaborative-Whiteboard
```

### 3. Run the Backend Server
```bash
cd server
npm install
npm start
```
The server will start listening on port `5000`.

### 4. Run the React Client
Open a new terminal tab:
```bash
cd client
npm install
npm run dev
```
The client dev server will spin up on [http://localhost:5173/](http://localhost:5173/).

---

## 📐 Project Structure

```
Collaborative-Whiteboard/
├── server/
│   ├── server.js          # Express & Socket.io server logic
│   └── package.json       # Node dependency list
│
└── client/
    ├── src/
    │   ├── components/
    │   │   ├── Whiteboard.jsx     # Canvas drawing and gesture capture
    │   │   └── CursorOverlay.jsx  # Smooth user cursors transition
    │   │
    │   ├── canvasUtils.js         # Canvas geometry and drawings math
    │   ├── App.jsx                # Layout, states, and action controllers
    │   ├── main.jsx               # React DOM Entry
    │   └── index.css              # Custom grid patterns & styles
    │
    ├── index.html                 # HTML frame & Google Fonts Loader
    ├── tailwind.config.js         # Tailwind configuration
    ├── postcss.config.js          # PostCSS processor setup
    └── package.json               # Client dependency list
```

---

## 📄 License
This project is licensed under the MIT License.
