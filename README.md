# MediRoute

MediRoute is a full-stack, production-ready web application designed for intelligent healthcare routing and logistics.

## Tech Stack

- **Frontend**: React.js, Vite
- **Backend**: Node.js, Express.js
- **Database**: MongoDB Atlas (Mongoose)
- **AI**: Google Gemini API
- **Deployment**: Vercel (Frontend), Render (Backend)

## Architecture Overview

```
mediroute/
├── client/                 # React.js SPA (Vite)
│   ├── public/             # Static public assets
│   └── src/
│       ├── assets/         # Images, icons, static assets
│       ├── components/     # Modular, reusable UI components
│       ├── hooks/          # Custom reusable React hooks
│       ├── pages/          # Application page views
│       ├── services/       # API communication client
│       └── utils/          # Frontend helpers and constants
└── server/                 # Express REST API (Node.js)
    └── src/
        ├── config/         # Database and environment configurations
        ├── controllers/    # API endpoint request handlers
        ├── middleware/     # Global error and request middleware
        ├── models/         # Mongoose schemas
        ├── routes/         # REST API routes
        ├── services/       # AI & business logic services
        └── utils/          # Response formatters and logger
```

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm (v9+)

### Installation

1. Install backend dependencies:
   ```bash
   cd server
   npm install
   ```

2. Install frontend dependencies:
   ```bash
   cd ../client
   npm install
   ```

### Running Locally

1. **Backend Server**:
   ```bash
   cd server
   npm run dev
   ```
   Server runs on `http://localhost:5000` by default.

2. **Frontend Client**:
   ```bash
   cd client
   npm run dev
   ```
   Client runs on `http://localhost:5173` by default.
