let ws;
let myId;
let userId;
let peerConnection;
let localStream;
let isAudioMuted = false;
let isVideoMuted = false;
let isAvailable = true;
let notificationSound = null;

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Elementos do DOM
const attendantRegistration = document.getElementById('attendantRegistration');
const attendantStatus = document.getElementById('attendantStatus');
const queuePanel = document.getElementById('queuePanel');
const callInterface = document.getElementById('callInterface');
const registerBtn = document.getElementById('registerBtn');
const attendantNameInput = document.getElementById('attendantName');
const regStatus = document.getElementById('regStatus');
const displayName = document.getElementById('displayName');
const statusBadge = document.getElementById('statusBadge');
const queueCount = document.getElementById('queueCount');
const queueList = document.getElementById('queueList');
const userName = document.getElementById('userName');
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const hangupBtn = document.getElementById('hangupBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callStatus = document.getElementById('callStatus');

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Conectado ao servidor');
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    switch(data.type) {
      case 'init':
        myId = data.id;
        break;

      case 'registered':
        showAttendantPanel();
        updateQueue(data.queue);
        break;

      case 'queue-update':
        updateQueue(data.queue);
        playNotificationSound();
        break;

      case 'start-call':
        userId = data.userId;
        userName.textContent = data.userName;
        await startCall();
        break;

      case 'offer':
        await handleOffer(data);
        break;

      case 'answer':
        await handleAnswer(data);
        break;

      case 'ice-candidate':
        await handleIceCandidate(data);
        break;

      case 'call-ended':
        handleCallEnded(data.reason);
        break;

      case 'error':
        showRegStatus(data.message, 'error');
        break;
    }
  };

  ws.onerror = () => {
    showRegStatus('Erro ao conectar com o servidor', 'error');
  };

  ws.onclose = () => {
    showRegStatus('Conexão perdida com o servidor', 'error');
  };
}

function registerAttendant() {
  const name = attendantNameInput.value.trim();

  if (!name || name.length < 3) {
    showRegStatus('Por favor, digite seu nome', 'error');
    return;
  }

  sendMessage({
    type: 'register-attendant',
    name: name
  });

  displayName.textContent = name;
  registerBtn.disabled = true;
}

function showAttendantPanel() {
  attendantRegistration.classList.add('hidden');
  attendantStatus.classList.remove('hidden');
  queuePanel.classList.remove('hidden');
  updateStatusBadge();
}

function updateQueue(queue) {
  queueCount.textContent = queue.length;

  if (queue.length === 0) {
    queueList.innerHTML = `
      <div class="empty-queue">
        <div class="empty-queue-icon">📋</div>
        <p>Nenhum usuário na fila no momento</p>
      </div>
    `;
    return;
  }

  queueList.innerHTML = queue.map((user, index) => {
    const waitTime = Math.floor((Date.now() - user.timestamp) / 1000);
    const minutes = Math.floor(waitTime / 60);
    const seconds = waitTime % 60;
    
    return `
      <div class="queue-item" data-user-id="${user.id}">
        <div class="queue-item-info">
          <div class="queue-item-name">${index + 1}. ${user.name}</div>
          <div class="queue-item-details">CPF: ${formatCpf(user.cpf)}</div>
          <div class="queue-item-time">⏱️ Aguardando: ${minutes}m ${seconds}s</div>
        </div>
        <button class="accept-btn" onclick="acceptCall('${user.id}')">
          ✓ Aceitar Chamada
        </button>
      </div>
    `;
  }).join('');
}

function formatCpf(cpf) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function acceptCall(userIdToAccept) {
  if (!isAvailable) {
    showNotification('Você já está em uma chamada', 'error');
    return;
  }

  userId = userIdToAccept;
  
  sendMessage({
    type: 'accept-call',
    userId: userId
  });

  isAvailable = false;
  updateStatusBadge();
}

async function startCall() {
  queuePanel.classList.add('hidden');
  attendantStatus.classList.add('hidden');
  callInterface.classList.remove('hidden');
  
  await startLocalStream();
}

async function startLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;
    createPeerConnection();
    showCallStatus('Mídia local iniciada', 'success');
  } catch (error) {
    showCallStatus('Erro ao acessar câmera/microfone', 'error');
    console.error(error);
  }
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    showCallStatus('Chamada conectada', 'success');
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendMessage({
        type: 'ice-candidate',
        candidate: event.candidate,
        target: userId
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log(`Connection state: ${peerConnection.connectionState}`);
    if (peerConnection.connectionState === 'connected') {
      showCallStatus('Conectado ao usuário', 'success');
    }
  };
}

async function handleOffer(data) {
  userId = data.from;

  if (!peerConnection) {
    await startLocalStream();
  }

  await peerConnection.setRemoteDescription(data.offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  sendMessage({
    type: 'answer',
    answer: answer,
    target: userId
  });

  showCallStatus('Respondendo chamada...', 'info');
}

async function handleAnswer(data) {
  await peerConnection.setRemoteDescription(data.answer);
}

async function handleIceCandidate(data) {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(data.candidate);
    }
  } catch (error) {
    console.error('Erro ao adicionar ICE candidate:', error);
  }
}

function toggleAudio() {
  if (localStream) {
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks()[0].enabled = !isAudioMuted;
    muteBtn.textContent = isAudioMuted ? '🔇 Mutado' : '🎤 Mutar';
  }
}

function toggleVideo() {
  if (localStream) {
    isVideoMuted = !isVideoMuted;
    localStream.getVideoTracks()[0].enabled = !isVideoMuted;
    videoBtn.textContent = isVideoMuted ? '📹 Câmera Desligada' : '📹 Câmera';
  }
}

function hangup() {
  sendMessage({
    type: 'end-call'
  });

  cleanup();
  isAvailable = true;
  updateStatusBadge();
  
  callInterface.classList.add('hidden');
  attendantStatus.classList.remove('hidden');
  queuePanel.classList.remove('hidden');
  
  showCallStatus('Chamada encerrada', 'info');
}

function handleCallEnded(reason) {
  cleanup();
  isAvailable = true;
  updateStatusBadge();
  
  callInterface.classList.add('hidden');
  attendantStatus.classList.remove('hidden');
  queuePanel.classList.remove('hidden');
  
  showNotification(reason || 'Chamada encerrada', 'info');
}

function cleanup() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  userId = null;
}

function updateStatusBadge() {
  if (isAvailable) {
    statusBadge.textContent = '🟢 Disponível';
    statusBadge.className = 'status-badge status-online';
  } else {
    statusBadge.textContent = '🟡 Em Atendimento';
    statusBadge.className = 'status-badge status-busy';
  }
}

function playNotificationSound() {
  // Toca som de notificação (pode ser implementado com Web Audio API)
  // Por enquanto, apenas log
  console.log('🔔 Nova pessoa na fila!');
}

function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  
  if (type === 'error') {
    notification.style.background = '#f44336';
  }
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function sendMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function showRegStatus(message, type) {
  regStatus.textContent = message;
  regStatus.style.background =
    type === 'success' ? '#d4edda' :
    type === 'error' ? '#f8d7da' :
    '#d1ecf1';
  regStatus.style.color =
    type === 'success' ? '#155724' :
    type === 'error' ? '#721c24' :
    '#0c5460';
  regStatus.style.padding = '10px';
  regStatus.style.marginTop = '10px';
  regStatus.style.borderRadius = '5px';
}

function showCallStatus(message, type) {
  callStatus.textContent = message;
  callStatus.style.background =
    type === 'success' ? '#d4edda' :
    type === 'error' ? '#f8d7da' :
    '#d1ecf1';
  callStatus.style.color =
    type === 'success' ? '#155724' :
    type === 'error' ? '#721c24' :
    '#0c5460';
}

// Event Listeners
registerBtn.addEventListener('click', registerAttendant);
muteBtn.addEventListener('click', toggleAudio);
videoBtn.addEventListener('click', toggleVideo);
hangupBtn.addEventListener('click', hangup);

// Conecta ao servidor ao carregar
connectWebSocket();

// Torna a função acceptCall global para poder ser chamada do HTML
window.acceptCall = acceptCall;
