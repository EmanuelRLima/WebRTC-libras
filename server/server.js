import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '../client')));

const clients = new Map();

wss.on('connection', (ws) => {
  const clientId = generateId();
  clients.set(clientId, ws);

  console.log(`Client connected: ${clientId}`);

  ws.send(JSON.stringify({
    type: 'init',
    id: clientId
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.target && clients.has(data.target)) {
        const targetClient = clients.get(data.target);
        targetClient.send(JSON.stringify({
          ...data,
          from: clientId
        }));
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  });
});

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Access on local network: http://YOUR_IP:${PORT}`);
});