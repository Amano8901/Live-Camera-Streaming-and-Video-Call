import './index.css';

const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const createOfferBtn = document.getElementById('createOfferBtn') as HTMLButtonElement;
const createAnswerBtn = document.getElementById('createAnswerBtn') as HTMLButtonElement;
const setRemoteDescriptionBtn = document.getElementById('setRemoteDescriptionBtn') as HTMLButtonElement;
const shareScreenBtn = document.getElementById('shareScreenBtn') as HTMLButtonElement;
const toggleCameraBtn = document.getElementById('toggleCameraBtn') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;

const localVideo = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement;

const offerSdpTextarea = document.getElementById('offerSdp') as HTMLTextAreaElement;
const answerSdpTextarea = document.getElementById('answerSdp') as HTMLTextAreaElement;
const offerToAnswerTextarea = document.getElementById('offerToAnswer') as HTMLTextAreaElement;
const answerSdpOutputTextarea = document.getElementById('answerSdpOutput') as HTMLTextAreaElement;

const statusEl = document.getElementById('status') as HTMLParagraphElement;
const callControls = document.getElementById('call-controls') as HTMLDivElement;
const activeCallControls = document.getElementById('active-call-controls') as HTMLDivElement;

let localStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let peerConnection: RTCPeerConnection | null = null;

const servers: RTCConfiguration = {
  iceServers: [
    {
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
    },
  ],
};

const updateStatus = (message: string) => {
    statusEl.textContent = message;
};

const stopScreenShare = async (replaceTrack = true) => {
    if (!screenStream) return;
    
    updateStatus('Screen sharing stopped.');
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
    shareScreenBtn.textContent = 'Share Screen';
    toggleCameraBtn.disabled = false;
    localVideo.srcObject = localStream;

    if (replaceTrack && peerConnection && localStream && peerConnection.connectionState === 'connected') {
        try {
            const cameraTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender && cameraTrack) {
                await sender.replaceTrack(cameraTrack);
            }
        } catch (error) {
            console.error('Error reverting to camera track.', error);
        }
    }
};

const resetConnection = () => {
    if (screenStream) {
        stopScreenShare(false);
    }

    if (peerConnection) {
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
        peerConnection = null;
    }
    
    remoteVideo.srcObject = null;
    
    callControls.classList.remove('hidden');
    activeCallControls.classList.add('hidden');
    
    offerSdpTextarea.value = '';
    answerSdpTextarea.value = '';
    offerToAnswerTextarea.value = '';
    answerSdpOutputTextarea.value = '';

    updateStatus('Friend disconnected. You can create a new offer or wait for one.');
};

const setupPeerConnection = () => {
  peerConnection = new RTCPeerConnection(servers);

  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream?.getTracks().forEach(track => {
    peerConnection!.addTrack(track, localStream!);
  });

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream!.addTrack(track);
    });
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection?.connectionState === 'connected') {
        updateStatus('Connected to friend!');
        callControls.classList.add('hidden');
        activeCallControls.classList.remove('hidden');

        const videoTrack = localStream?.getVideoTracks()?.[0];
        if (videoTrack?.enabled) {
            toggleCameraBtn.textContent = 'Turn Camera Off';
        } else {
            toggleCameraBtn.textContent = 'Turn Camera On';
        }
        toggleCameraBtn.disabled = !!screenStream;

    } else if (peerConnection && ['disconnected', 'failed', 'closed'].includes(peerConnection.connectionState)) {
        resetConnection();
    }
  };

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
        if (peerConnection?.localDescription?.type === 'offer') {
            offerSdpTextarea.value = JSON.stringify(peerConnection.localDescription);
        } else if (peerConnection?.localDescription?.type === 'answer') {
            answerSdpOutputTextarea.value = JSON.stringify(peerConnection.localDescription);
        }
    }
  };
};

const startCamera = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    startBtn.disabled = true;
    callControls.classList.remove('hidden');
    updateStatus('Camera started. Create an offer or wait for one.');
  } catch (error) {
    console.error('Error accessing media devices.', error);
    updateStatus('Error: Could not access camera. Please check permissions.');
  }
};

const createOffer = async () => {
  if (!localStream) {
    updateStatus('Please start your camera first.');
    return;
  }
  setupPeerConnection();
  try {
    const offer = await peerConnection!.createOffer();
    await peerConnection!.setLocalDescription(offer);
    offerSdpTextarea.value = JSON.stringify(peerConnection!.localDescription);
    updateStatus('Offer created. Copy and send it to your friend.');
  } catch (error) {
    console.error('Error creating offer.', error);
    updateStatus('Error creating call offer.');
  }
};

const createAnswer = async () => {
    if (!localStream) {
        updateStatus('Please start your camera first.');
        return;
    }
    setupPeerConnection();
    const offerSdp = offerToAnswerTextarea.value;
    if (!offerSdp) {
        updateStatus('Please paste an offer from your friend first.');
        return;
    }

    try {
        const offer = JSON.parse(offerSdp);
        await peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection!.createAnswer();
        await peerConnection!.setLocalDescription(answer);
        answerSdpOutputTextarea.value = JSON.stringify(peerConnection!.localDescription);
        updateStatus('Answer created. Copy and send it back to the caller.');
    } catch (error) {
        console.error('Error creating answer.', error);
        updateStatus('Error: Invalid offer SDP. Please check the pasted text.');
    }
};

const setRemoteDescription = async () => {
    const answerSdp = answerSdpTextarea.value;
    if (!answerSdp) {
        updateStatus('Please paste the answer from your friend.');
        return;
    }

    try {
        const answer = JSON.parse(answerSdp);
        if (peerConnection && !peerConnection.currentRemoteDescription) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    } catch (error) {
        console.error('Error setting remote description.', error);
        updateStatus('Error: Invalid answer SDP. Please check the pasted text.');
    }
};

const startScreenShare = async () => {
    if (!peerConnection || peerConnection.connectionState !== 'connected') {
        updateStatus('Must be in an active call to share screen.');
        return;
    }

    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
            await sender.replaceTrack(screenTrack);
            updateStatus('Screen sharing started.');
        } else {
            console.error("Video sender not found.");
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
            return;
        }

        localVideo.srcObject = screenStream;
        shareScreenBtn.textContent = 'Stop Sharing';
        toggleCameraBtn.disabled = true;

        screenTrack.onended = () => {
            stopScreenShare();
        };

    } catch (error) {
        console.error('Error starting screen share.', error);
        updateStatus('Could not start screen share. User likely cancelled.');
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
        }
    }
};

const toggleScreenShare = () => {
    if (screenStream) {
        stopScreenShare();
    } else {
        startScreenShare();
    }
};

const toggleCamera = () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        if (videoTrack.enabled) {
            toggleCameraBtn.textContent = 'Turn Camera Off';
            updateStatus('Camera turned on.');
        } else {
            toggleCameraBtn.textContent = 'Turn Camera On';
            updateStatus('Camera turned off.');
        }
    }
};

const disconnectCall = () => {
    if (screenStream) {
        stopScreenShare(false);
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
        peerConnection = null;
    }

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    offerSdpTextarea.value = '';
    answerSdpTextarea.value = '';
    offerToAnswerTextarea.value = '';
    answerSdpOutputTextarea.value = '';

    startBtn.disabled = false;
    callControls.classList.add('hidden');
    activeCallControls.classList.add('hidden');

    updateStatus('Please start your camera to begin.');
};

startBtn.addEventListener('click', startCamera);
createOfferBtn.addEventListener('click', createOffer);
createAnswerBtn.addEventListener('click', createAnswer);
setRemoteDescriptionBtn.addEventListener('click', setRemoteDescription);
shareScreenBtn.addEventListener('click', toggleScreenShare);
toggleCameraBtn.addEventListener('click', toggleCamera);
disconnectBtn.addEventListener('click', disconnectCall);