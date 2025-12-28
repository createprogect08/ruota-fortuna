const socket = io();

let currentRoom = null;
let currentNickname = null;
let mySessionId = null;
let currentTurnSid = null;
let wheelData = {
    voci: [],
    punizioni: []
};
let isSpinning = false;
let allUsers = [];

const screens = {
    home: document.getElementById('home-screen'),
    create: document.getElementById('create-screen'),
    join: document.getElementById('join-screen'),
    game: document.getElementById('game-screen')
};

function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('code');
    const nickname = urlParams.get('user');
    
    if (roomCode && nickname) {
        socket.emit('join_room', {
            nickname: decodeURIComponent(nickname),
            room_code: roomCode,
            is_rejoin: true
        });
    }
});

document.getElementById('btn-create').addEventListener('click', () => {
    showScreen('create');
});

document.getElementById('btn-join').addEventListener('click', () => {
    showScreen('join');
});

document.getElementById('btn-back-create').addEventListener('click', () => {
    showScreen('home');
});

document.getElementById('btn-back-join').addEventListener('click', () => {
    showScreen('home');
});

document.getElementById('btn-confirm-create').addEventListener('click', () => {
    const nickname = document.getElementById('create-nickname').value.trim();
    const vociText = document.getElementById('voci-input').value;
    const punizioniText = document.getElementById('punizioni-input').value;
    
    if (!nickname) {
        alert('Inserisci un nickname!');
        return;
    }
    
    const voci = vociText.split('\n').filter(v => v.trim());
    const punizioni = punizioniText.split('\n').filter(p => p.trim());
    
    if (voci.length < 2) {
        alert('Inserisci almeno 2 voci!');
        return;
    }
    
    if (punizioni.length < 2) {
        alert('Inserisci almeno 2 punizioni!');
        return;
    }
    
    socket.emit('create_room', {
        nickname: nickname,
        voci: voci,
        punizioni: punizioni
    });
});

document.getElementById('btn-confirm-join').addEventListener('click', () => {
    const nickname = document.getElementById('join-nickname').value.trim();
    const roomCode = document.getElementById('room-code-input').value.trim();
    
    if (!nickname) {
        alert('Inserisci un nickname!');
        return;
    }
    
    if (roomCode.length !== 6) {
        alert('Il codice deve essere di 6 cifre!');
        return;
    }
    
    socket.emit('join_room', {
        nickname: nickname,
        room_code: roomCode
    });
});

socket.on('room_created', (data) => {
    currentRoom = data.room_code;
    currentNickname = data.nickname;
    wheelData.voci = data.voci;
    wheelData.punizioni = data.punizioni;
    mySessionId = data.my_sid;
    currentTurnSid = data.current_turn;
    allUsers = data.users;
    
    const newUrl = `${window.location.origin}/?code=${data.room_code}&user=${encodeURIComponent(data.nickname)}`;
    window.history.pushState({}, '', newUrl);
    
    document.getElementById('room-code-display').textContent = data.room_code;
    updateUsers(data.users, data.current_turn);
    showScreen('game');
    drawWheel();
    updateTurnDisplay(data.current_turn);
});

socket.on('joined_room', (data) => {
    currentRoom = data.room_code;
    currentNickname = data.nickname;
    wheelData.voci = data.voci;
    wheelData.punizioni = data.punizioni;
    mySessionId = data.my_sid;
    currentTurnSid = data.current_turn;
    allUsers = data.users;
    
    const newUrl = `${window.location.origin}/?code=${data.room_code}&user=${encodeURIComponent(data.nickname)}`;
    window.history.pushState({}, '', newUrl);
    
    document.getElementById('room-code-display').textContent = data.room_code;
    updateUsers(data.users, data.current_turn);
    showScreen('game');
    drawWheel();
    updateTurnDisplay(data.current_turn);
});

socket.on('user_joined', (data) => {
    allUsers = data.users;
    currentTurnSid = data.current_turn;
    updateUsers(data.users, data.current_turn);
});

socket.on('user_left', (data) => {
    allUsers = data.users;
    currentTurnSid = data.current_turn;
    updateUsers(data.users, data.current_turn);
    updateTurnDisplay(data.current_turn);
});

socket.on('wheel_result', (data) => {
    currentTurnSid = data.next_turn;
    animateWheel(data.voce, () => {
        document.getElementById('voce-result').textContent = data.voce;
        document.getElementById('punizione-result').textContent = data.punizione;
        updateTurnDisplay(data.next_turn);
        isSpinning = false;
    });
});

socket.on('error', (data) => {
    alert(data.message);
    if (data.message === 'Stanza non trovata') {
        const newUrl = window.location.origin;
        window.history.pushState({}, '', newUrl);
        showScreen('home');
    }
});

socket.on('connect', () => {
    mySessionId = socket.id;
});

document.getElementById('btn-spin').addEventListener('click', () => {
    if (isSpinning) return;
    if (!isMyTurn()) {
        alert('Non è il tuo turno!');
        return;
    }
    
    isSpinning = true;
    socket.emit('spin_wheel', { room_code: currentRoom });
});

function drawWheel() {
    const canvas = document.getElementById('wheel-canvas');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 180;
    
    const colors = ['#ff006e', '#ffbe0b', '#06ffa5', '#00d4ff', '#fb5607', '#8338ec', '#3a86ff', '#fb5607'];
    const numSlices = wheelData.voci.length;
    const anglePerSlice = (2 * Math.PI) / numSlices;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < numSlices; i++) {
        const startAngle = i * anglePerSlice - Math.PI / 2;
        const endAngle = startAngle + anglePerSlice;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + anglePerSlice / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(wheelData.voci[i], radius / 1.5, 0);
        ctx.restore();
    }
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 5;
    ctx.stroke();
}

function animateWheel(targetVoce, callback) {
    const canvas = document.getElementById('wheel-canvas');
    const ctx = canvas.getContext('2d');
    const numSlices = wheelData.voci.length;
    const anglePerSlice = (2 * Math.PI) / numSlices;
    const targetIndex = wheelData.voci.indexOf(targetVoce);
    
    let currentRotation = 0;
    const spins = 5;
    const targetAngle = (numSlices - targetIndex - 0.5) * anglePerSlice;
    const targetRotation = (spins * 2 * Math.PI) + targetAngle;
    const duration = 3000;
    const startTime = Date.now();
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        currentRotation = targetRotation * easeOut;
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 180;
        const colors = ['#ff006e', '#ffbe0b', '#06ffa5', '#00d4ff', '#fb5607', '#8338ec', '#3a86ff', '#fb5607'];
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < numSlices; i++) {
            const startAngle = i * anglePerSlice - Math.PI / 2 + currentRotation;
            const endAngle = startAngle + anglePerSlice;
            
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = colors[i % colors.length];
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(startAngle + anglePerSlice / 2);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(wheelData.voci[i], radius / 1.5, 0);
            ctx.restore();
        }
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 5;
        ctx.stroke();
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            callback();
        }
    }
    
    animate();
}

function updateUsers(users, turnSid) {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    allUsers = users;
    currentTurnSid = turnSid;
    
    users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.dataset.sid = user.sid;
        if (user.sid === turnSid) {
            userItem.classList.add('active-turn');
        }
        userItem.textContent = user.nickname;
        usersList.appendChild(userItem);
    });
    
    updateSpinButton(turnSid);
}

function updateTurnDisplay(turnSid) {
    currentTurnSid = turnSid;
    const allUserItems = document.querySelectorAll('.user-item');
    
    allUserItems.forEach(item => {
        item.classList.remove('active-turn');
        if (item.dataset.sid === turnSid) {
            item.classList.add('active-turn');
        }
    });
    
    const turnUser = allUsers.find(u => u.sid === turnSid);
    if (turnUser) {
        document.getElementById('turn-display').textContent = turnUser.nickname;
    }
    
    updateSpinButton(turnSid);
}

function updateSpinButton(turnSid) {
    const spinButton = document.getElementById('btn-spin');
    if (mySessionId === turnSid) {
        spinButton.disabled = false;
        spinButton.textContent = 'GIRA!';
    } else {
        spinButton.disabled = true;
        spinButton.textContent = 'NON È IL TUO TURNO';
    }
}

function isMyTurn() {
    return mySessionId === currentTurnSid;
}
