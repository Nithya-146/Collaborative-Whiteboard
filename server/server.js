import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for simplicity in development
    methods: ['GET', 'POST']
  }
});

// Port configuration
const PORT = process.env.PORT || 5000;

// Room state storage (in-memory)
// RoomID -> { elements: [], users: {} }
// users: socketId -> { username, color, cursor: { x, y } }
const rooms = new Map();

// Helper to get or create room state
function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      elements: [],
      users: {}
    });
  }
  return rooms.get(roomId);
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Track the room the user joined
  let currentRoomId = null;
  let userId = socket.id;

  // Handle joining a room
  socket.on('join-room', ({ roomId, username, cursorColor }) => {
    currentRoomId = roomId;
    socket.join(roomId);

    const room = getOrCreateRoom(roomId);
    
    // Add user to the room state
    room.users[socket.id] = {
      id: socket.id,
      username: username || `Guest-${socket.id.slice(0, 4)}`,
      color: cursorColor || '#3B82F6',
      cursor: null
    };

    console.log(`User ${room.users[socket.id].username} (${socket.id}) joined room: ${roomId}`);

    // Send existing board state (elements) and the list of active users to the joined user
    socket.emit('room-state', {
      elements: room.elements,
      users: room.users
    });

    // Broadcast user joined to other users in the room
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      user: room.users[socket.id]
    });
  });

  // Handle live cursor movement
  socket.on('cursor-move', ({ x, y }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.users[socket.id]) {
      room.users[socket.id].cursor = { x, y };
      // Broadcast cursor movement to all other clients in the room
      socket.to(currentRoomId).emit('cursor-update', {
        userId: socket.id,
        cursor: { x, y }
      });
    }
  });

  // Handle when a client starts drawing (live preview)
  socket.on('draw-start', (drawingState) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('draw-start-remote', {
      userId: socket.id,
      drawingState
    });
  });

  // Handle steps/movements of drawings (live preview)
  socket.on('draw-step', (drawingState) => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('draw-step-remote', {
      userId: socket.id,
      drawingState
    });
  });

  // Handle drawing end (live preview cleanup)
  socket.on('draw-end', () => {
    if (!currentRoomId) return;
    socket.to(currentRoomId).emit('draw-end-remote', {
      userId: socket.id
    });
  });

  // Handle when an element is completed and added to the board
  socket.on('element-added', (element) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      room.elements.push(element);
      // Broadcast the newly added element to all other clients in the room
      socket.to(currentRoomId).emit('element-added-remote', element);
    }
  });

  // Handle when elements are deleted (via eraser)
  socket.on('elements-deleted', (deletedIds) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      room.elements = room.elements.filter(el => !deletedIds.includes(el.id));
      socket.to(currentRoomId).emit('elements-deleted-remote', deletedIds);
    }
  });

  // Handle Undo (removes the last element added by this socket's ownerId or socketId)
  socket.on('undo', ({ ownerId }) => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.elements.length > 0) {
      // Find the last element owned by this user
      let foundIndex = -1;
      for (let i = room.elements.length - 1; i >= 0; i--) {
        if (room.elements[i].ownerId === ownerId) {
          foundIndex = i;
          break;
        }
      }

      if (foundIndex !== -1) {
        const removedElement = room.elements.splice(foundIndex, 1)[0];
        io.to(currentRoomId).emit('element-removed-remote', {
          id: removedElement.id,
          elements: room.elements // send full updated list for safety, or client deletes locally
        });
        console.log(`Undo element ${removedElement.id} in room ${currentRoomId}`);
      }
    }
  });

  // Handle clear board
  socket.on('clear-board', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      room.elements = [];
      io.to(currentRoomId).emit('board-cleared-remote');
      console.log(`Cleared board in room: ${currentRoomId}`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room && room.users[socket.id]) {
        delete room.users[socket.id];
        // Broadcast user left to others
        socket.to(currentRoomId).emit('user-left', socket.id);
        
        // Clean up empty rooms to avoid memory leak
        if (Object.keys(room.users).length === 0) {
          rooms.delete(currentRoomId);
          console.log(`Room ${currentRoomId} is empty. Deleted room state.`);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
