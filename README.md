# Neon Heroes - Arena

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js (v18+)

### Development Setup

1. **Start Infrastructure (Database)**

   ```bash
   docker-compose up -d
   ```

   - phpMyAdmin will be available at [http://localhost:8080](http://localhost:8080).

2. **Backend Setup**

   ```bash
   cd server
   npm install
   npm run seed # Run this after starting the server once to populate Heroes
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd client
   npm install
   npm run dev
   ```
