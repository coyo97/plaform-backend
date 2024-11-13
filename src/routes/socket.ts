// src/routes/socket.ts
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyToken } from '../authentication/authUser';
import { MessageModel, IMessage } from './schemas/message';
import { GroupModel } from './schemas/group';
import { IUser } from './schemas/user';
import { StreamModel, IStream } from './schemas/stream';
import { Model } from 'mongoose';
import App from '../app';

interface AuthenticatedSocket extends Socket {
	data: {
		userId?: string;
	};
}

export class SocketController {
	private io: SocketIOServer;
	private connectedUsers: Map<string, string>;
	private messageModel: ReturnType<typeof MessageModel>;
	private groupModel: ReturnType<typeof GroupModel>;
	private streamModel: Model<IStream>

	constructor(io: SocketIOServer, app: App) {
		this.io = io;
		this.connectedUsers = new Map();
		this.messageModel = MessageModel(app.getClientMongoose());
		this.groupModel = GroupModel(app.getClientMongoose());
		this.streamModel = StreamModel;
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
				socket.data.userId = payload.userId;
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

			console.log(`Usuario conectado: ${userId} con socket ID: ${socket.id}`);
			// Guardar usuario conectado
			this.connectedUsers.set(userId, socket.id);

			// Escuchar el evento para unirse a una sala
			socket.on('join-room', (roomId: string) => {
				socket.join(roomId);
				console.log(`Usuario ${userId} se unió a la sala ${roomId}`);
			});

			// Evitar registrar eventos múltiples veces
			if ((socket as any).eventsRegistered) {
				console.warn(`Eventos ya registrados para el socket ${socket.id}`);
			} else {
				// Registrar eventos
				this.initializeMessageEvents(socket);
				this.initializeStreamEvents(socket);
				(socket as any).eventsRegistered = true;
			}

			// Manejar desconexión
			socket.on('disconnect', () => {
				console.log(`Usuario desconectado: ${userId}`);
				this.connectedUsers.delete(userId);
			});
		});
	}

	private initializeMessageEvents(socket: AuthenticatedSocket): void {
		console.log(`Inicializando eventos para el socket ${socket.id} del usuario ${socket.data.userId}`)
		socket.on('send-message', async (data) => {
			console.log(`Evento 'send-message' recibido en socket ${socket.id} con datos:`, data);
			try {
				const { content, receiverId, isGroupMessage, groupId } = data;
				const senderId = socket.data.userId;
				console.log('Datos del mensaje recibido en send-message:', {
					senderId,
					receiverId,
					isGroupMessage,
					groupId,
				});
				// Validar datos
				if (!senderId || (isGroupMessage && !groupId) || (!isGroupMessage && !receiverId)) {
					console.error('Faltan senderId o receiverId/groupId');
					return;
				}

				// Crear el mensaje
				const newMessage = new this.messageModel({
					sender: senderId,
					receiver: isGroupMessage ? null : receiverId,
					content,
					isGroupMessage,
					groupId,
				});
				console.log('Mensaje recibido del cliente:', {
					content,
					receiverId,
					isGroupMessage,
					groupId,
					senderId,
				});

				let savedMessage = await newMessage.save();

				// Popula el sender para incluir la imagen de perfil
				savedMessage = await savedMessage.populate({
					path: 'sender',
					select: 'username',
					populate: {
						path: 'profile',
						select: 'profilePicture',
					},
				});
				//await this.emitMessage(savedMessage, isGroupMessage, receiverId, groupId);
				// Convertir savedMessage a IMessage
				const populatedMessage = savedMessage as IMessage;
				console.log('Mensaje guardado y populado:', populatedMessage);

				// Emitir el mensaje a los usuarios conectados
				if (isGroupMessage) {
					// Obtener el grupo y emitir a cada miembro
					const group = await this.groupModel.findById(groupId).populate('members');
					if (!group) {
						console.error('Grupo no encontrado');
						return;
					}

					group.members.forEach((member: any) => {
						const memberId = member._id.toString();
						const memberSocketId = this.connectedUsers.get(memberId);
						if (memberSocketId) {
							this.io.to(memberSocketId).emit('receive-message', populatedMessage);
							// Emitir notificación a cada miembro del grupo
							this.io.to(memberSocketId).emit('new-notification', {
								message: `Nuevo mensaje en el grupo ${group.name}`,
								type: 'group-message',
								data: populatedMessage,
							});
						}
					});
				} else {
					// Lógica para mensajes privados
					if (!receiverId) {
						console.error('receiverId is undefined for a private message.');
						return;
					}
					const receiverSocketId = this.connectedUsers.get(receiverId);
					console.log(`Buscando socket del receptor ${receiverId}: ${receiverSocketId}`);
					if (receiverSocketId) {
						console.log(`Emitiendo mensaje al receptor ${receiverId} en socket ${receiverSocketId}`);
						const sender = populatedMessage.sender as IUser;
						this.io.to(receiverSocketId).emit('receive-message', populatedMessage);
						// Emitir una notificación para mensajes privados
						this.io.to(receiverSocketId).emit('new-notification', {
							message: `Nuevo mensaje de ${sender.username}`,
							type: 'message',
							data: populatedMessage,
						});
					} else {
						console.warn(`Usuario destino ${receiverId} no está conectado.`);
					}
				}
			} catch (error) {
				console.error('Error al enviar el mensaje:', error);
			}
		});

		// Otros eventos relacionados con mensajes pueden ir aquí
	}

	// Método público para emitir mensajes
	public async emitMessage(
		savedMessage: IMessage,
		isGroup: boolean,
		receiverId?: string,
		groupId?: string
	): Promise<void> {
		const populatedMessage = savedMessage as IMessage;
		const senderId = populatedMessage.sender._id.toString()
		// Emitir el mensaje al remitente
		const senderSocketId = this.connectedUsers.get(senderId);
		if (senderSocketId) {
			console.log(`Emitiendo mensaje al remitente ${senderId} en socket ${senderSocketId}`);
			this.io.to(senderSocketId).emit('receive-message', populatedMessage);
		}
		if (isGroup) {
			// Lógica para mensajes grupales
			const group = await this.groupModel.findById(groupId).populate('members');
			if (!group) {
				console.error('Grupo no encontrado');
				return;
			}

			group.members.forEach((member: any) => {
				const memberId = member._id.toString();
				const memberSocketId = this.connectedUsers.get(memberId);
				if (memberSocketId) {
					this.io.to(memberSocketId).emit('receive-message', populatedMessage);
					this.io.to(memberSocketId).emit('new-notification', {
						message: `Nuevo mensaje en el grupo ${group.name}`,
						type: 'group-message',
						data: populatedMessage,
					});
				}
			});
		} else {
			// Lógica para mensajes privados
			// Lógica para mensajes privados
			if (!receiverId) {
				receiverId = populatedMessage.receiver?._id.toString();
				if (!receiverId) {
					console.error('receiverId is undefined for a private message.');
					return;
				}
			}

			console.log(`receiverId: ${receiverId}`);
			const receiverSocketId = this.connectedUsers.get(receiverId);
			if (receiverSocketId) {
				const sender = populatedMessage.sender as IUser;
				console.log(`Emitiendo mensaje al receptor ${receiverId} en socket ${receiverSocketId}`);
				this.io.to(receiverSocketId).emit('receive-message', populatedMessage);
				this.io.to(receiverSocketId).emit('new-notification', {
					message: `Nuevo mensaje de ${sender.username}`,
					type: 'message',
					data: populatedMessage,
				});
			} else {
				console.warn(`Usuario destino ${receiverId} no está conectado.`);
			}

		}
	}
	// Método para obtener el socketId de un usuario
	public getSocketId(userId: string): string | undefined {
		return this.connectedUsers.get(userId);
	}

	// Método público para emitir notificaciones a un usuario
	public emitNotification(userId: string, notificationData: any): void {
		const socketId = this.connectedUsers.get(userId);
		if (socketId) {
			this.io.to(socketId).emit('new-notification', notificationData);
		} else {
			console.log(`Usuario ${userId} no está conectado.`);
		}
	}

	// Método público para emitir eventos a una sala específica
	public emitToRoom(roomId: string, eventName: string, data: any): void {
		this.io.to(roomId).emit(eventName, data);
	}

	private initializeStreamEvents(socket: AuthenticatedSocket): void {
		const userId = socket.data.userId;
		if (!userId) return;

		// Unirse a la sala de stream
		socket.on('join-stream', (streamId: string) => {
			socket.join(streamId); // Unir al usuario a la sala
			console.log(`Usuario ${userId} se unió al stream ${streamId}`);
		});

		// Manejo de oferta WebRTC
		socket.on('offer', (streamId: string, offer: any) => {
			socket.to(streamId).emit('offer', offer); // Emitir oferta a los demás
		});

		// Manejo de respuesta WebRTC
		socket.on('answer', (streamId: string, answer: any) => {
			socket.to(streamId).emit('answer', answer); // Emitir respuesta a los demás
		});

		// Manejo de candidatos ICE
		socket.on('ice-candidate', (streamId: string, candidate: any) => {
			socket.to(streamId).emit('ice-candidate', candidate); // Emitir candidato ICE
		});
		// Eventos para la compartición de pantalla
		socket.on('screen-share-offer', (data) => {
			const { streamId, offer } = data;
			socket.to(streamId).emit('screen-share-offer', { senderSocketId: socket.id, offer });
		});

		socket.on('screen-share-answer', (data) => {
			const { streamId, answer } = data;
			socket.to(streamId).emit('screen-share-answer', { senderSocketId: socket.id, answer });
		});

		socket.on('screen-share-ice-candidate', (data) => {
			const { streamId, candidate } = data;
			socket.to(streamId).emit('screen-share-ice-candidate', { senderSocketId: socket.id, candidate });
		});

		// Manejar la desconexión
		socket.on('disconnect', () => {
			console.log(`Usuario desconectado: ${userId}`);
			this.connectedUsers.delete(userId);
		});
	}
	public async emitMessageDeletion(
		messageId: string,
		isGroup: boolean,
		receiverId?: string,
		groupId?: string
	): Promise<void> {
		// Emitir a los usuarios correspondientes
		if (isGroup) {
			// Emitir a todos los miembros del grupo
			const group = await this.groupModel.findById(groupId).populate('members');
			if (!group) {
				console.error('Grupo no encontrado');
				return;
			}

			group.members.forEach((member: any) => {
				const memberId = member._id.toString();
				const memberSocketId = this.connectedUsers.get(memberId);
				if (memberSocketId) {
					this.io.to(memberSocketId).emit('message-deleted', { messageId });
				}
			});
		} else {
			// Emitir al receptor
			if (!receiverId) {
				console.error('receiverId is undefined for a private message deletion.');
				return;
			}

			const receiverSocketId = this.connectedUsers.get(receiverId);
			if (receiverSocketId) {
				this.io.to(receiverSocketId).emit('message-deleted', { messageId });
			} else {
				console.warn(`Usuario destino ${receiverId} no está conectado.`);
			}
		}
	}
}

export default SocketController;

