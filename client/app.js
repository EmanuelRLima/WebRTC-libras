let ws;
let myId;
let targetId;
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

const myIdElement = document.getElementById('myId');
const targetIdInput = document.getElementById('targetId');
const callBtn = document.getElementById('callBtn');
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const hangupBtn = document.getElementById('hangupBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusElement = document.getElementById('status');

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    showStatus('Connected to server', 'success');
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    switch(data.type) {
      case 'init':
        myId = data.id;
        myIdElement.textContent = myId;
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
    }
  };

  ws.onerror = () => {
    showStatus('WebSocket connection failed', 'error');
  };
}

async function startLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;
    showStatus('Local media started', 'success');
  } catch (error) {
    showStatus('Failed to access camera/microphone', 'error');
    console.error(error);
  }
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    showStatus('Call connected', 'success');
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendMessage({
        type: 'ice-candidate',
        candidate: event.candidate,
        target: targetId
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    showStatus(`State: ${peerConnection.connectionState}`, 'info');
  };
}

async function startCall() {
  targetId = targetIdInput.value.trim();

  if (!targetId) {
    showStatus('Please enter recipient ID', 'error');
    return;
  }

  if (!localStream) {
    await startLocalStream();
  }

  createPeerConnection();

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  sendMessage({
    type: 'offer',
    offer: offer,
    target: targetId
  });

  showStatus('Calling...', 'info');
}

async function handleOffer(data) {
  targetId = data.from;

  if (!localStream) {
    await startLocalStream();
  }

  createPeerConnection();

  await peerConnection.setRemoteDescription(data.offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  sendMessage({
    type: 'answer',
    answer: answer,
    target: targetId
  });

  showStatus('Incoming call', 'info');
}

async function handleAnswer(data) {
  await peerConnection.setRemoteDescription(data.answer);
}

async function handleIceCandidate(data) {
  try {
    await peerConnection.addIceCandidate(data.candidate);
  } catch (error) {
    console.error('Error adding ICE candidate:', error);
  }
}

function sendMessage(message) {
  ws.send(JSON.stringify(message));
}

function toggleAudio() {
  if (localStream) {
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks()[0].enabled = !isAudioMuted;
    muteBtn.textContent = isAudioMuted ? '🔇 Muted' : '🎤 Mute';
  }
}

function toggleVideo() {
  if (localStream) {
    isVideoMuted = !isVideoMuted;
    localStream.getVideoTracks()[0].enabled = !isVideoMuted;
    videoBtn.textContent = isVideoMuted ? '📹 Video Off' : '📹 Video';
  }
}

function hangup() {
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
  targetId = null;

  showStatus('Call ended', 'info');
}

function showStatus(message, type) {
  statusElement.textContent = message;
  statusElement.style.background =
    type === 'success' ? '#d4edda' :
    type === 'error' ? '#f8d7da' :
    '#d1ecf1';
  statusElement.style.color =
    type === 'success' ? '#155724' :
    type === 'error' ? '#721c24' :
    '#0c5460';
}

callBtn.addEventListener('click', startCall);
muteBtn.addEventListener('click', toggleAudio);
videoBtn.addEventListener('click', toggleVideo);
hangupBtn.addEventListener('click', hangup);

connectWebSocket();