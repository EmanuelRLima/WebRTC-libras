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

// Estrutura de dados
const clients = new Map(); // Todos os clientes conectados
const attendants = new Map(); // Atendentes disponíveis
const waitingQueue = []; // Fila de usuários aguardando atendimento
const activeCalls = new Map(); // Chamadas ativas (clientId -> attendantId)

wss.on('connection', (ws) => {
  const clientId = generateId();
  clients.set(clientId, { ws, type: null, info: null });

  console.log(`Client connected: ${clientId}`);

  ws.send(JSON.stringify({
    type: 'init',
    id: clientId
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(clientId, data);
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    handleDisconnect(clientId);
  });
});

function handleMessage(clientId, data) {
  const client = clients.get(clientId);

  switch(data.type) {
    case 'register-user':
      // Usuário se registra na fila
      client.type = 'user';
      client.info = { name: data.name, cpf: data.cpf };
      
      waitingQueue.push({
        id: clientId,
        name: data.name,
        cpf: data.cpf,
        timestamp: Date.now()
      });

      console.log(`User ${data.name} joined queue. Queue size: ${waitingQueue.length}`);
      
      // Notifica o usuário que entrou na fila
      client.ws.send(JSON.stringify({
        type: 'queued',
        position: waitingQueue.length
      }));

      // Notifica todos os atendentes sobre novo usuário na fila
      notifyAttendantsQueueUpdate();
      break;

    case 'register-attendant':
      // Atendente se registra como disponível
      client.type = 'attendant';
      client.info = { name: data.name };
      attendants.set(clientId, true); // true = disponível

      console.log(`Attendant ${data.name} is now online`);

      // Envia a fila atual para o atendente
      client.ws.send(JSON.stringify({
        type: 'registered',
        queue: waitingQueue
      }));
      break;

    case 'accept-call':
      // Atendente aceita uma chamada
      const userToCall = waitingQueue.find(u => u.id === data.userId);
      
      if (!userToCall) {
        client.ws.send(JSON.stringify({
          type: 'error',
          message: 'Usuário não está mais na fila'
        }));
        return;
      }

      // Remove da fila
      const index = waitingQueue.findIndex(u => u.id === data.userId);
      waitingQueue.splice(index, 1);

      // Marca atendente como ocupado
      attendants.set(clientId, false);

      // Registra chamada ativa
      activeCalls.set(data.userId, clientId);

      const userClient = clients.get(data.userId);
      
      // Notifica o usuário que foi aceito
      userClient.ws.send(JSON.stringify({
        type: 'call-accepted',
        attendantId: clientId,
        attendantName: client.info.name
      }));

      // Notifica o atendente para iniciar a chamada
      client.ws.send(JSON.stringify({
        type: 'start-call',
        userId: data.userId,
        userName: userToCall.name
      }));

      console.log(`Call started: ${userToCall.name} <-> ${client.info.name}`);

      // Atualiza fila para outros atendentes
      notifyAttendantsQueueUpdate();
      break;

    case 'offer':
    case 'answer':
    case 'ice-candidate':
      // Encaminha mensagens WebRTC entre os pares
      if (data.target && clients.has(data.target)) {
        const targetClient = clients.get(data.target);
        targetClient.ws.send(JSON.stringify({
          ...data,
          from: clientId
        }));
      }
      break;

    case 'end-call':
      // Encerra uma chamada
      handleCallEnd(clientId);
      break;
  }
}

function handleDisconnect(clientId) {
  const client = clients.get(clientId);
  
  if (client) {
    if (client.type === 'user') {
      // Remove da fila se estava aguardando
      const index = waitingQueue.findIndex(u => u.id === clientId);
      if (index !== -1) {
        waitingQueue.splice(index, 1);
        notifyAttendantsQueueUpdate();
      }

      // Se estava em chamada, notifica o atendente
      if (activeCalls.has(clientId)) {
        const attendantId = activeCalls.get(clientId);
        handleCallEnd(clientId);
      }
    } else if (client.type === 'attendant') {
      // Remove dos atendentes
      attendants.delete(clientId);

      // Se estava em chamada, notifica o usuário
      for (const [userId, attId] of activeCalls.entries()) {
        if (attId === clientId) {
          const userClient = clients.get(userId);
          if (userClient) {
            userClient.ws.send(JSON.stringify({
              type: 'call-ended',
              reason: 'Atendente desconectou'
            }));
          }
          activeCalls.delete(userId);
        }
      }
    }
  }

  clients.delete(clientId);
  console.log(`Client disconnected: ${clientId}`);
}

function handleCallEnd(clientId) {
  const client = clients.get(clientId);
  
  if (client.type === 'user' && activeCalls.has(clientId)) {
    const attendantId = activeCalls.get(clientId);
    const attendantClient = clients.get(attendantId);
    
    if (attendantClient) {
      attendantClient.ws.send(JSON.stringify({
        type: 'call-ended',
        reason: 'Usuário encerrou a chamada'
      }));
      
      // Marca atendente como disponível novamente
      attendants.set(attendantId, true);
    }
    
    activeCalls.delete(clientId);
  } else if (client.type === 'attendant') {
    // Encontra a chamada do atendente
    for (const [userId, attId] of activeCalls.entries()) {
      if (attId === clientId) {
        const userClient = clients.get(userId);
        if (userClient) {
          userClient.ws.send(JSON.stringify({
            type: 'call-ended',
            reason: 'Atendente encerrou a chamada'
          }));
        }
        activeCalls.delete(userId);
        break;
      }
    }
    
    // Marca atendente como disponível
    attendants.set(clientId, true);
  }

  notifyAttendantsQueueUpdate();
}

function notifyAttendantsQueueUpdate() {
  const queueData = JSON.stringify({
    type: 'queue-update',
    queue: waitingQueue
  });

  for (const [attendantId, isAvailable] of attendants.entries()) {
    if (isAvailable) {
      const attendant = clients.get(attendantId);
      if (attendant && attendant.ws.readyState === 1) { // WebSocket.OPEN
        attendant.ws.send(queueData);
      }
    }
  }
}

function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Access on local network: http://YOUR_IP:${PORT}`);
  console.log(`\nUser interface: http://localhost:${PORT}/user.html`);
  console.log(`Attendant interface: http://localhost:${PORT}/attendant.html`);
});