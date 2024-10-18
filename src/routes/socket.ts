// src/routes/socket.ts
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyToken } from '../authentication/authUser';
import { UserModel } from './schemas/user'; // Asegúrate de importar el esquema de usuario

interface AuthenticatedSocket extends Socket {
	data: {
		userId?: string;
	};
}

export class SocketController {
	private io: SocketIOServer;
	private connectedUsers: Map<string, string>; // Mapa para rastrear usuarios conectados: userId -> socketId

	constructor(io: SocketIOServer) {
		this.io = io;
		this.connectedUsers = new Map(); // Inicializa el mapa
		this.initializeSocketEvents();
	}

	private initializeSocketEvents(): void {
		// Middleware de autenticación de Socket.IO
		this.io.use((socket: AuthenticatedSocket, next) => {
			const token = socket.handshake.auth.token;
			if (!token) {
				console.error('Token no proporcionado en la conexión de Socket.IO');
				return next(new Error('Authentication error'));
			}
			try {
				const payload = verifyToken(token);
				socket.data.userId = payload.userId; // Almacenar userId en el socket
				next();
			} catch (error) {
				console.error('Token inválido en la conexión de Socket.IO:', error);
				next(new Error('Invalid token'));
			}
		});

		// Manejo de eventos de conexión
		this.io.on('connection', (socket: AuthenticatedSocket) => {
			const userId = socket.data.userId;
			if (!userId) return;

			console.log(`Usuario conectado: ${userId}`);

			// Guardar usuario conectado
			this.connectedUsers.set(userId, socket.id);

			// Escuchar el evento para unirse a una sala
			socket.on('join-room', (roomId: string) => {
				socket.join(roomId); // Unir al usuario a la sala
				console.log(`Usuario ${userId} se unió a la sala ${roomId}`);
			});

			// Escuchar el evento de enviar mensaje
			socket.on('send-message', (data) => {
				const { receiverId, content, isGroupMessage, groupId } = data;
				console.log(`Mensaje de ${userId}: ${content}`);

				// Emitir mensaje a una sala o a un usuario específico
				if (isGroupMessage && groupId) {
					this.io.to(groupId).emit('receive-message', {
						senderId: userId,
						content,
						isGroupMessage,
						groupId,
					});
				} else {
					// Emitir el mensaje directamente al socket del usuario destino
					const receiverSocketId = this.connectedUsers.get(receiverId);
					if (receiverSocketId) {
						this.io.to(receiverSocketId).emit('receive-message', {
							senderId: userId,
							content,
						});
					} else {
						console.log(`Usuario destino ${receiverId} no está conectado.`);
					}
				}
			});

			// Manejar desconexión
			socket.on('disconnect', () => {
				console.log(`Usuario desconectado: ${userId}`);
				this.connectedUsers.delete(userId); // Remover usuario de la lista de conectados
			});
		});
	}
	 // Método para obtener el socketId de un usuario
  public getSocketId(userId: string): string | undefined {
    return this.connectedUsers.get(userId);
  }
}

export default SocketController;

