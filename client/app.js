let ws;
let myId;
let currentRoom = null;
let localStream;
let isAudioMuted = false;
let isVideoMuted = false;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingCanvas = null;
let recordingContext = null;
let recordingAnimationFrame = null;
let recordingAudioContext = null;
let roomIsRecording = false; // Controla se alguém já está gravando

// Map<peerId, RTCPeerConnection>
const peerConnections = new Map();
// Map<peerId, HTMLElement> — tile no grid
const peerTiles = new Map();

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Lobby
const lobbyEl     = document.getElementById('lobby');
const roomEl      = document.getElementById('room');
const myIdElement = document.getElementById('myId');
const roomIdInput = document.getElementById('roomId');
const joinBtn     = document.getElementById('joinBtn');
const lobbyStatus = document.getElementById('lobbyStatus');

// Sala
const videosGrid  = document.getElementById('videosGrid');
const roomLabel   = document.getElementById('roomLabel');
const muteBtn     = document.getElementById('muteBtn');
const videoBtn    = document.getElementById('videoBtn');
const recordBtn   = document.getElementById('recordBtn');
const hangupBtn   = document.getElementById('hangupBtn');
const statusElement = document.getElementById('status');

// ── Tiles ───────────────────────────────────────────

function createTile(id, label, stream, isLocal) {
  const tile = document.createElement('div');
  tile.className = 'video-tile';
  tile.dataset.peerId = id;

  const avatar = document.createElement('div');
  avatar.className = 'tile-avatar';
  avatar.textContent = '👤';

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsinline = true;
  if (isLocal) video.muted = true;

  const lbl = document.createElement('span');
  lbl.className = 'tile-label';
  lbl.textContent = label;

  tile.appendChild(avatar);
  tile.appendChild(video);
  tile.appendChild(lbl);

  if (stream) {
    video.srcObject = stream;
    tile.classList.add('has-video');
  }

  videosGrid.appendChild(tile);
  updateGridCount();
  return tile;
}

function removeTile(peerId) {
  const tile = peerTiles.get(peerId);
  if (tile) {
    tile.remove();
    peerTiles.delete(peerId);
    updateGridCount();
  }
}

function updateGridCount() {
  const count = videosGrid.children.length;
  videosGrid.dataset.count = count;
}

function setTileStream(tile, stream) {
  const video = tile.querySelector('video');
  video.srcObject = stream;
  tile.classList.add('has-video');
}

// ── WebSocket ────────────────────────────────────────

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  console.log('Conectando ao WebSocket:', wsUrl);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket conectado');
    showLobbyStatus('Conectado ao servidor', 'success');
    joinBtn.disabled = false;
  };

  ws.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('Mensagem recebida:', data.type, data);

      switch (data.type) {
        case 'init':
          myId = data.id;
          myIdElement.textContent = myId;
          console.log('Inicializado com ID:', myId);
          break;

        case 'room-joined':
          console.log('Entrando na sala:', data.room, 'peers:', data.peers);
          await enterRoom(data.room, data.peers);
          break;

        case 'room-full':
          showLobbyStatus('Sala lotada (máximo 5 participantes)', 'error');
          currentRoom = null;
          break;

        case 'peer-joined':
          // O novo par enviará um offer; apenas aguardamos
          showStatus(`Novo participante entrando...`, 'info');
          break;

        case 'peer-left':
          handlePeerLeft(data.peerId);
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

        case 'recording-started':
          if (data.recorderId !== myId) {
            roomIsRecording = true;
            recordBtn.disabled = true;
            recordBtn.style.opacity = '0.5';
            showStatus(`${data.recorderId.substring(0, 6)} está gravando...`, 'info');
          }
          break;

        case 'recording-stopped':
          if (data.recorderId !== myId) {
            roomIsRecording = false;
            recordBtn.disabled = false;
            recordBtn.style.opacity = '1';
            showStatus('Gravação finalizada', 'info');
          }
          break;
      }
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('Erro no WebSocket:', error);
    showLobbyStatus('Falha na conexão WebSocket', 'error');
    joinBtn.disabled = true;
  };

  ws.onclose = () => {
    console.log('WebSocket desconectado');
    showLobbyStatus('Desconectado do servidor', 'error');
    joinBtn.disabled = true;
    
    // Tenta reconectar após 3 segundos
    setTimeout(() => {
      console.log('Tentando reconectar...');
      connectWebSocket();
    }, 3000);
  };
}

// ── Fluxo da sala ────────────────────────────────────

async function joinRoom() {
  const room = roomIdInput.value.trim();
  if (!room) {
    showLobbyStatus('Informe o ID da sala', 'error');
    return;
  }

  // Verifica se o WebSocket está conectado
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showLobbyStatus('Aguardando conexão com o servidor...', 'error');
    console.error('WebSocket não está conectado');
    return;
  }

  showLobbyStatus('Acessando câmera/microfone...', 'info');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    console.log('Mídia local obtida com sucesso');
  } catch (error) {
    showLobbyStatus('Falha ao acessar câmera/microfone', 'error');
    console.error('Erro ao acessar mídia:', error);
    return;
  }

  currentRoom = room;
  console.log('Enviando join-room para sala:', room);
  sendMessage({ type: 'join-room', room });
  showLobbyStatus('Entrando na sala...', 'info');
}

async function enterRoom(room, peers) {
  console.log('enterRoom chamada - sala:', room, 'peers:', peers);
  
  try {
    // Troca de tela
    lobbyEl.classList.add('hidden');
    roomEl.classList.remove('hidden');
    roomLabel.textContent = `Sala: ${room}`;

    // Tile local
    const localTile = createTile(myId, 'Você', localStream, true);
    peerTiles.set(myId, localTile);

    showStatus(`${peers.length + 1} participante(s)`, 'success');

    // Inicia chamada com cada par existente
    for (const peerId of peers) {
      console.log('Iniciando chamada para peer:', peerId);
      await startCallTo(peerId);
    }
    
    console.log('Sala configurada com sucesso');
  } catch (error) {
    console.error('Erro em enterRoom:', error);
    showLobbyStatus('Erro ao entrar na sala: ' + error.message, 'error');
  }
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection(configuration);

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    let tile = peerTiles.get(peerId);
    if (!tile) {
      tile = createTile(peerId, peerId.substring(0, 6), null, false);
      peerTiles.set(peerId, tile);
    }
    setTileStream(tile, event.streams[0]);
    showStatus('Chamada conectada', 'success');
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendMessage({ type: 'ice-candidate', candidate: event.candidate, target: peerId });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      handlePeerLeft(peerId);
    }
  };

  peerConnections.set(peerId, pc);
  return pc;
}

async function startCallTo(peerId) {
  const pc = createPeerConnection(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendMessage({ type: 'offer', offer, target: peerId });
}

async function handleOffer(data) {
  const peerId = data.from;
  const pc = createPeerConnection(peerId);
  await pc.setRemoteDescription(data.offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendMessage({ type: 'answer', answer, target: peerId });
  showStatus('Chamada recebida', 'info');
}

async function handleAnswer(data) {
  const pc = peerConnections.get(data.from);
  if (pc) await pc.setRemoteDescription(data.answer);
}

async function handleIceCandidate(data) {
  const pc = peerConnections.get(data.from);
  if (pc) {
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (e) {
      console.error('Erro ao adicionar ICE candidate:', e);
    }
  }
}

function handlePeerLeft(peerId) {
  removeTile(peerId);
  const pc = peerConnections.get(peerId);
  if (pc) { pc.close(); peerConnections.delete(peerId); }
  showStatus('Um participante saiu', 'info');
}

// ── Controles ────────────────────────────────────────

function sendMessage(msg) {
  ws.send(JSON.stringify(msg));
}

function toggleAudio() {
  if (!localStream) return;
  isAudioMuted = !isAudioMuted;
  localStream.getAudioTracks()[0].enabled = !isAudioMuted;
  muteBtn.classList.toggle('off', isAudioMuted);
  muteBtn.textContent = isAudioMuted ? '🔇' : '🎤';
}

function toggleVideo() {
  if (!localStream) return;
  isVideoMuted = !isVideoMuted;
  localStream.getVideoTracks()[0].enabled = !isVideoMuted;
  videoBtn.classList.toggle('off', isVideoMuted);
  videoBtn.textContent = isVideoMuted ? '🚫' : '📹';
}

// ── Recording ────────────────────────────────────────

function toggleRecording() {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
}

function startRecording() {
  if (!localStream) {
    showStatus('Não há stream para gravar', 'error');
    return;
  }

  if (roomIsRecording) {
    showStatus('Outra pessoa já está gravando a reunião', 'error');
    return;
  }

  try {
    recordedChunks = [];
    
    // Cria canvas para capturar todo o grid de vídeos
    recordingCanvas = document.createElement('canvas');
    recordingCanvas.width = 1920;
    recordingCanvas.height = 1080;
    recordingContext = recordingCanvas.getContext('2d', { willReadFrequently: true });
    
    // Combina todos os áudios da sala
    recordingAudioContext = new AudioContext();
    const mixedAudioDestination = recordingAudioContext.createMediaStreamDestination();
    
    // Adiciona áudio local
    const localAudioSource = recordingAudioContext.createMediaStreamSource(localStream);
    localAudioSource.connect(mixedAudioDestination);
    
    // Adiciona áudio dos peers
    for (const [peerId, tile] of peerTiles) {
      if (peerId !== myId) {
        const video = tile.querySelector('video');
        if (video && video.srcObject) {
          try {
            const peerAudioSource = recordingAudioContext.createMediaStreamSource(video.srcObject);
            peerAudioSource.connect(mixedAudioDestination);
          } catch (e) {
            console.warn('Erro ao adicionar áudio do peer:', e);
          }
        }
      }
    }
    
    // Função para desenhar todos os vídeos no canvas
    function drawVideosToCanvas() {
      if (!isRecording) return;
      
      // Limpa canvas com fundo escuro
      recordingContext.fillStyle = '#1a1a2e';
      recordingContext.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);
      
      // Pega todos os tiles de vídeo
      const tiles = Array.from(peerTiles.values());
      const totalTiles = tiles.length;
      
      if (totalTiles > 0) {
        // Calcula layout do grid
        let cols, rows;
        if (totalTiles === 1) { cols = 1; rows = 1; }
        else if (totalTiles === 2) { cols = 2; rows = 1; }
        else if (totalTiles <= 4) { cols = 2; rows = 2; }
        else { cols = 3; rows = 2; }
        
        const tileWidth = recordingCanvas.width / cols;
        const tileHeight = recordingCanvas.height / rows;
        
        // Desenha cada vídeo
        tiles.forEach((tile, index) => {
          const video = tile.querySelector('video');
          if (video && video.readyState >= video.HAVE_CURRENT_DATA && !video.paused) {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = col * tileWidth;
            const y = row * tileHeight;
            
            try {
              // Desenha o vídeo mantendo proporção
              recordingContext.drawImage(video, x, y, tileWidth, tileHeight);
              
              // Desenha label do participante
              const label = tile.querySelector('.tile-label');
              if (label) {
                recordingContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
                recordingContext.fillRect(x + 10, y + tileHeight - 40, 150, 30);
                recordingContext.fillStyle = '#ffffff';
                recordingContext.font = '18px Arial';
                recordingContext.fillText(label.textContent, x + 20, y + tileHeight - 18);
              }
            } catch (e) {
              console.warn('Erro ao desenhar vídeo no canvas:', e);
            }
          }
        });
      }
      
      // Adiciona timestamp
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      recordingContext.fillStyle = 'rgba(220, 53, 69, 0.8)';
      recordingContext.fillRect(10, 10, 100, 40);
      recordingContext.fillStyle = '#ffffff';
      recordingContext.font = 'bold 20px Arial';
      recordingContext.fillText(`⏺ ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`, 20, 35);
      
      recordingAnimationFrame = requestAnimationFrame(drawVideosToCanvas);
    }
    
    // Aguarda um pouco para garantir que os vídeos estão prontos
    setTimeout(() => {
      // Inicia o desenho no canvas
      drawVideosToCanvas();
      
      // Captura o stream do canvas + áudio mixado
      const canvasStream = recordingCanvas.captureStream(30); // 30 FPS
      const videoTrack = canvasStream.getVideoTracks()[0];
      const audioTracks = mixedAudioDestination.stream.getAudioTracks();
      const recordStream = new MediaStream([videoTrack, ...audioTracks]);
      
      mediaRecorder = new MediaRecorder(recordStream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 2500000 // 2.5 Mbps para melhor qualidade
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Para a animação do canvas
        if (recordingAnimationFrame) {
          cancelAnimationFrame(recordingAnimationFrame);
          recordingAnimationFrame = null;
        }
        
        // Fecha o audio context
        if (recordingAudioContext) {
          recordingAudioContext.close();
          recordingAudioContext = null;
        }
        
        // Notifica outros participantes que a gravação parou
        sendMessage({ type: 'recording-stopped', recorderId: myId });
        roomIsRecording = false;
        
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const duration = Date.now() - recordingStartTime;
        
        showStatus(`Gravação finalizada (${Math.round(duration/1000)}s). Enviando para S3...`, 'info');
        
        await uploadRecording(blob);
        
        // Limpa canvas
        recordingCanvas = null;
        recordingContext = null;
      };

      mediaRecorder.start(1000); // Captura dados a cada 1s
      console.log('MediaRecorder iniciado');
    }, 500);
    
    recordingStartTime = Date.now();
    isRecording = true;
    roomIsRecording = true;
    
    // Notifica outros participantes que iniciou a gravação
    sendMessage({ type: 'recording-started', recorderId: myId });
    
    recordBtn.classList.add('recording');
    recordBtn.textContent = '⏹️';
    showStatus('Gravando todos os participantes...', 'success');
    
  } catch (error) {
    console.error('Erro ao iniciar gravação:', error);
    showStatus('Erro ao iniciar gravação: ' + error.message, 'error');
    
    // Limpa recursos em caso de erro
    if (recordingAnimationFrame) cancelAnimationFrame(recordingAnimationFrame);
    if (recordingAudioContext) recordingAudioContext.close();
    roomIsRecording = false;
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    isRecording = false;
    mediaRecorder.stop();
    recordBtn.classList.remove('recording');
    recordBtn.textContent = '⏺️';
  }
}

async function uploadRecording(blob) {
  try {
    const formData = new FormData();
    formData.append('recording', blob, `recording_${Date.now()}.webm`);
    formData.append('roomId', currentRoom);
    formData.append('timestamp', Date.now());

    const response = await fetch('/api/upload-recording', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok) {
      showStatus('Gravação enviada para S3 com sucesso!', 'success');
      console.log('Upload successful:', result);
      
      // Opcional: download local como backup
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording_${currentRoom}_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      showStatus('Erro ao enviar gravação: ' + result.error, 'error');
      console.error('Upload failed:', result);
    }
  } catch (error) {
    console.error('Erro no upload:', error);
    showStatus('Erro ao enviar gravação: ' + error.message, 'error');
  }
}

function hangup() {
  // Para gravação se estiver ativa
  if (isRecording) {
    stopRecording();
  }
  
  for (const [, pc] of peerConnections) pc.close();
  peerConnections.clear();

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  // Limpa grid
  videosGrid.innerHTML = '';
  peerTiles.clear();
  updateGridCount();

  currentRoom = null;

  // Volta ao lobby
  roomEl.classList.add('hidden');
  lobbyEl.classList.remove('hidden');
  showLobbyStatus('Você saiu da sala', 'info');
}

// ── Status ───────────────────────────────────────────

function showStatus(message, type) {
  statusElement.textContent = message;
  statusElement.style.background =
    type === 'success' ? '#d4edda' :
    type === 'error'   ? '#f8d7da' : '#d1ecf1';
  statusElement.style.color =
    type === 'success' ? '#155724' :
    type === 'error'   ? '#721c24' : '#0c5460';
}

function showLobbyStatus(message, type) {
  lobbyStatus.textContent = message;
  lobbyStatus.style.background =
    type === 'success' ? '#d4edda' :
    type === 'error'   ? '#f8d7da' : '#d1ecf1';
  lobbyStatus.style.color =
    type === 'success' ? '#155724' :
    type === 'error'   ? '#721c24' : '#0c5460';
}

// ── Init ─────────────────────────────────────────────

// Desabilita o botão até conectar
joinBtn.disabled = true;
showLobbyStatus('Conectando ao servidor...', 'info');

joinBtn.addEventListener('click', joinRoom);
roomIdInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !joinBtn.disabled) joinRoom(); });
muteBtn.addEventListener('click', toggleAudio);
videoBtn.addEventListener('click', toggleVideo);
recordBtn.addEventListener('click', toggleRecording);
hangupBtn.addEventListener('click', hangup);

connectWebSocket();