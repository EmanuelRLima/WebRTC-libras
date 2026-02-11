let ws;
let myId;
let attendantId;
let peerConnection;
let localStream;
let isAudioMuted = false;
let isVideoMuted = false;

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Elementos do DOM
const registrationForm = document.getElementById('registrationForm');
const queueStatus = document.getElementById('queueStatus');
const callInterface = document.getElementById('callInterface');
const joinQueueBtn = document.getElementById('joinQueueBtn');
const userNameInput = document.getElementById('userName');
const userCpfInput = document.getElementById('userCpf');
const formStatus = document.getElementById('formStatus');
const queuePosition = document.getElementById('queuePosition');
const attendantName = document.getElementById('attendantName');
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const hangupBtn = document.getElementById('hangupBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callStatus = document.getElementById('callStatus');

// Máscara de CPF
userCpfInput.addEventListener('input', (e) => {
  let value = e.target.value.replace(/\D/g, '');
  if (value.length > 11) value = value.slice(0, 11);
  
  if (value.length > 9) {
    value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  } else if (value.length > 6) {
    value = value.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  } else if (value.length > 3) {
    value = value.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  }
  
  e.target.value = value;
});

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

      case 'queued':
        showQueueStatus(data.position);
        break;

      case 'call-accepted':
        attendantId = data.attendantId;
        attendantName.textContent = data.attendantName;
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
        showFormStatus(data.message, 'error');
        break;
    }
  };

  ws.onerror = () => {
    showFormStatus('Erro ao conectar com o servidor', 'error');
  };

  ws.onclose = () => {
    showFormStatus('Conexão perdida com o servidor', 'error');
  };
}

function joinQueue() {
  const name = userNameInput.value.trim();
  const cpf = userCpfInput.value.replace(/\D/g, '');

  if (!name || name.length < 3) {
    showFormStatus('Por favor, digite seu nome completo', 'error');
    return;
  }

  if (cpf.length !== 11) {
    showFormStatus('Por favor, digite um CPF válido', 'error');
    return;
  }

  sendMessage({
    type: 'register-user',
    name: name,
    cpf: cpf
  });

  joinQueueBtn.disabled = true;
}

function showQueueStatus(position) {
  registrationForm.classList.add('hidden');
  queueStatus.classList.remove('hidden');
  queuePosition.textContent = `Posição na fila: ${position}`;
}

async function startCall() {
  queueStatus.classList.add('hidden');
  callInterface.classList.remove('hidden');
  
  await startLocalStream();
  createPeerConnection();

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  sendMessage({
    type: 'offer',
    offer: offer,
    target: attendantId
  });

  showCallStatus('Conectando...', 'info');
}

async function startLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;
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
        target: attendantId
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log(`Connection state: ${peerConnection.connectionState}`);
    if (peerConnection.connectionState === 'connected') {
      showCallStatus('Conectado ao atendente', 'success');
    }
  };
}

async function handleOffer(data) {
  attendantId = data.from;

  if (!peerConnection) {
    createPeerConnection();
  }

  await peerConnection.setRemoteDescription(data.offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  sendMessage({
    type: 'answer',
    answer: answer,
    target: attendantId
  });
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
  showCallStatus('Chamada encerrada', 'info');
  
  setTimeout(() => {
    location.reload();
  }, 2000);
}

function handleCallEnded(reason) {
  cleanup();
  showCallStatus(reason || 'Chamada encerrada', 'info');
  
  setTimeout(() => {
    location.reload();
  }, 3000);
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
}

function sendMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function showFormStatus(message, type) {
  formStatus.textContent = message;
  formStatus.style.background =
    type === 'success' ? '#d4edda' :
    type === 'error' ? '#f8d7da' :
    '#d1ecf1';
  formStatus.style.color =
    type === 'success' ? '#155724' :
    type === 'error' ? '#721c24' :
    '#0c5460';
  formStatus.style.padding = '10px';
  formStatus.style.marginTop = '10px';
  formStatus.style.borderRadius = '5px';
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
joinQueueBtn.addEventListener('click', joinQueue);
muteBtn.addEventListener('click', toggleAudio);
videoBtn.addEventListener('click', toggleVideo);
hangupBtn.addEventListener('click', hangup);

// Conecta ao servidor ao carregar
connectWebSocket();
