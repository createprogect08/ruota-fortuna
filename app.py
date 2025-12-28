from flask import Flask, render_template, request, session, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
import random
import string
import secrets
import threading

app = Flask(__name__)
app.config['SECRET_KEY'] = secrets.token_hex(16)
socketio = SocketIO(app, cors_allowed_origins="*")

rooms = {}
room_timers = {}

def generate_room_code():
    while True:
        code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        if code not in rooms:
            return code

def delete_room_after_timeout(room_code):
    if room_code in rooms:
        if len(rooms[room_code]['users']) == 0:
            del rooms[room_code]
            if room_code in room_timers:
                del room_timers[room_code]
            print(f"Stanza {room_code} eliminata dopo 20 minuti di inattività")

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('create_room')
def handle_create_room(data):
    voci = [v.strip() for v in data['voci'] if v.strip()]
    punizioni = [p.strip() for p in data['punizioni'] if p.strip()]
    nickname = data['nickname']
    
    room_code = generate_room_code()
    session_id = request.sid
    
    if room_code in room_timers:
        room_timers[room_code].cancel()
        del room_timers[room_code]
    
    rooms[room_code] = {
        'voci': voci,
        'punizioni': punizioni,
        'users': {session_id: {'nickname': nickname, 'sid': session_id}},
        'turn_order': [session_id],
        'current_turn_index': 0
    }
    
    join_room(room_code)
    session['room_code'] = room_code
    session['nickname'] = nickname
    
    emit('room_created', {
        'room_code': room_code,
        'nickname': nickname,
        'voci': voci,
        'punizioni': punizioni,
        'users': list(rooms[room_code]['users'].values()),
        'current_turn': rooms[room_code]['turn_order'][0],
        'my_sid': session_id
    })

@socketio.on('join_room')
def handle_join_room(data):
    room_code = data['room_code']
    nickname = data['nickname']
    session_id = request.sid
    is_rejoin = data.get('is_rejoin', False)
    
    if room_code not in rooms:
        emit('error', {'message': 'Stanza non trovata'})
        return
    
    if room_code in room_timers:
        room_timers[room_code].cancel()
        del room_timers[room_code]
    
    if not is_rejoin:
        rooms[room_code]['users'][session_id] = {'nickname': nickname, 'sid': session_id}
        rooms[room_code]['turn_order'].append(session_id)
    else:
        rooms[room_code]['users'][session_id] = {'nickname': nickname, 'sid': session_id}
        if session_id not in rooms[room_code]['turn_order']:
            rooms[room_code]['turn_order'].append(session_id)
    
    join_room(room_code)
    session['room_code'] = room_code
    session['nickname'] = nickname
    
    emit('joined_room', {
        'room_code': room_code,
        'nickname': nickname,
        'voci': rooms[room_code]['voci'],
        'punizioni': rooms[room_code]['punizioni'],
        'users': list(rooms[room_code]['users'].values()),
        'current_turn': rooms[room_code]['turn_order'][rooms[room_code]['current_turn_index']],
        'my_sid': session_id
    })
    
    if not is_rejoin:
        emit('user_joined', {
            'users': list(rooms[room_code]['users'].values()),
            'nickname': nickname,
            'current_turn': rooms[room_code]['turn_order'][rooms[room_code]['current_turn_index']]
        }, room=room_code, skip_sid=session_id)

@socketio.on('spin_wheel')
def handle_spin_wheel(data):
    room_code = data['room_code']
    session_id = request.sid
    
    if room_code not in rooms:
        emit('error', {'message': 'Stanza non trovata'})
        return
    
    room = rooms[room_code]
    current_turn_sid = room['turn_order'][room['current_turn_index']]
    
    if session_id != current_turn_sid:
        emit('error', {'message': 'Non è il tuo turno'})
        return
    
    voce_estratta = random.choice(room['voci'])
    punizione_estratta = random.choice(room['punizioni'])
    
    room['current_turn_index'] = (room['current_turn_index'] + 1) % len(room['turn_order'])
    next_turn_sid = room['turn_order'][room['current_turn_index']]
    
    emit('wheel_result', {
        'voce': voce_estratta,
        'punizione': punizione_estratta,
        'next_turn': next_turn_sid,
        'spinner': session_id
    }, room=room_code)

@socketio.on('disconnect')
def handle_disconnect():
    session_id = request.sid
    room_code = session.get('room_code')
    
    if room_code and room_code in rooms:
        room = rooms[room_code]
        if session_id in room['users']:
            nickname = room['users'][session_id]['nickname']
            del room['users'][session_id]
            
            if session_id in room['turn_order']:
                old_index = room['turn_order'].index(session_id)
                room['turn_order'].remove(session_id)
                
                if len(room['turn_order']) > 0:
                    if room['current_turn_index'] >= len(room['turn_order']):
                        room['current_turn_index'] = 0
                    elif old_index < room['current_turn_index']:
                        room['current_turn_index'] -= 1
                    
                    emit('user_left', {
                        'users': list(room['users'].values()),
                        'nickname': nickname,
                        'current_turn': room['turn_order'][room['current_turn_index']]
                    }, room=room_code)
                else:
                    timer = threading.Timer(1200, delete_room_after_timeout, [room_code])
                    timer.start()
                    room_timers[room_code] = timer
                    print(f"Stanza {room_code} vuota. Sarà eliminata tra 20 minuti.")

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
