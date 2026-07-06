import React from 'react';

export default function CursorOverlay({ users, currentUserId, zoom, panOffset }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {Object.entries(users).map(([userId, user]) => {
        // Don't render local user's cursor or users without active cursor positions
        if (userId === currentUserId || !user.cursor) return null;

        // Convert user's world position back to local screen coordinates
        const screenX = user.cursor.x * zoom + panOffset.x;
        const screenY = user.cursor.y * zoom + panOffset.y;

        return (
          <div
            key={userId}
            className="absolute top-0 left-0 cursor-smooth will-change-transform"
            style={{
              transform: `translate3d(${screenX}px, ${screenY}px, 0)`,
            }}
          >
            {/* SVG Cursor Pointer Arrow */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ color: user.color }}
            >
              <path
                d="M5.65376 12.3963L15.9037 4.19632C16.8906 3.40685 18.25 4.10894 18.25 5.37207V20.0078C18.25 21.3197 16.7441 22.0258 15.7533 21.1601L11.5307 17.4697C11.1396 17.1275 10.6384 16.9405 10.12 16.9405H6.25C5.00736 16.9405 4 15.9332 4 14.6905V14.625C4 13.7258 4.65306 12.9469 5.65376 12.3963Z"
                fill="currentColor"
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>

            {/* Username Badge */}
            <div
              className="ml-4 px-2.5 py-1 rounded-md text-xs font-semibold text-white shadow-md select-none pointer-events-none whitespace-nowrap animate-pulse"
              style={{
                backgroundColor: user.color,
                animationDuration: '3s'
              }}
            >
              {user.username}
            </div>
          </div>
        );
      })}
    </div>
  );
}
