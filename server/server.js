import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import multer from 'multer';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Validate AWS credentials
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('⚠️  WARNING: AWS credentials not found in .env file');
  console.error('   Recording upload to S3 will not work!');
  console.error('   Please configure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env');
} else {
  console.log('✅ AWS credentials loaded successfully');
  console.log(`   Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`   Bucket: ${process.env.AWS_S3_BUCKET || 'not configured'}`);
  console.log(`   Access Key: ${process.env.AWS_ACCESS_KEY_ID.substring(0, 8)}...`);
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json());

// Configure AWS S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  }
});

const MAX_ROOM_SIZE = 5;

// clients: Map<clientId, ws>
const clients = new Map();
// rooms: Map<roomId, Set<clientId>>
const rooms = new Map();
// clientRoom: Map<clientId, roomId>
const clientRoom = new Map();

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
      console.log(`Message from ${clientId}:`, data.type);

      switch (data.type) {
        case 'join-room': {
          const roomId = data.room;
          console.log(`Client ${clientId} trying to join room ${roomId}`);

          if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
          }

          const room = rooms.get(roomId);

          if (room.size >= MAX_ROOM_SIZE) {
            ws.send(JSON.stringify({ type: 'room-full', room: roomId }));
            return;
          }

          // Notifica os membros existentes sobre o novo participante
          const existingMembers = Array.from(room);
          room.add(clientId);
          clientRoom.set(clientId, roomId);

          // Envia ao novo cliente a lista de membros já na sala
          ws.send(JSON.stringify({
            type: 'room-joined',
            room: roomId,
            peers: existingMembers
          }));

          // Notifica cada membro existente sobre o novo participante
          for (const peerId of existingMembers) {
            const peerWs = clients.get(peerId);
            if (peerWs) {
              peerWs.send(JSON.stringify({
                type: 'peer-joined',
                peerId: clientId,
                room: roomId
              }));
            }
          }

          console.log(`Client ${clientId} joined room ${roomId} (${room.size}/${MAX_ROOM_SIZE})`);
          break;
        }

        case 'offer':
        case 'answer':
        case 'ice-candidate': {
          // Mensagens diretas entre pares (target obrigatório)
          if (data.target && clients.has(data.target)) {
            clients.get(data.target).send(JSON.stringify({
              ...data,
              from: clientId
            }));
          }
          break;
        }

        case 'recording-started':
        case 'recording-stopped': {
          // Notifica todos os membros da sala sobre o status da gravação
          const roomId = clientRoom.get(clientId);
          if (roomId && rooms.has(roomId)) {
            const room = rooms.get(roomId);
            for (const peerId of room) {
              if (peerId !== clientId) {
                const peerWs = clients.get(peerId);
                if (peerWs) {
                  peerWs.send(JSON.stringify({
                    type: data.type,
                    recorderId: clientId
                  }));
                }
              }
            }
          }
          break;
        }

        default:
          // Fallback: repasse direto se houver target
          if (data.target && clients.has(data.target)) {
            clients.get(data.target).send(JSON.stringify({
              ...data,
              from: clientId
            }));
          }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    const roomId = clientRoom.get(clientId);

    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.delete(clientId);

      // Notifica os demais membros da saída
      for (const peerId of room) {
        const peerWs = clients.get(peerId);
        if (peerWs) {
          peerWs.send(JSON.stringify({
            type: 'peer-left',
            peerId: clientId,
            room: roomId
          }));
        }
      }

      if (room.size === 0) {
        rooms.delete(roomId);
      }
    }

    clientRoom.delete(clientId);
    clients.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  });
});

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// Upload recording to S3
app.post('/api/upload-recording', upload.single('recording'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { roomId, timestamp } = req.body;
    const fileName = `${process.env.S3_RECORDINGS_FOLDER || 'webrtc-recordings/'}${roomId}_${timestamp}.webm`;

    console.log(`Uploading recording to S3: ${fileName}`);

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: 'video/webm'
      }
    });

    const result = await upload.done();

    console.log('Upload completed:', result.Location);

    res.json({
      success: true,
      url: result.Location,
      key: fileName
    });
  } catch (error) {
    console.error('Error uploading to S3:', error);
    res.status(500).json({
      error: 'Failed to upload recording',
      message: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Access on local network: http://YOUR_IP:${PORT}`);
});