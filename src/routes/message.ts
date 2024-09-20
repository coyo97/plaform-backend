// src/routes/messageController.ts
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { MessageModel, IMessage } from './schemas/message';
import App from '../app';
import { authMiddleware } from '../middlware/authMiddlewares';
import { Server as SocketIOServer } from 'socket.io';
import { GroupModel } from './schemas/group';

interface AuthRequest extends Request {
    userId?: string;
}

export class MessageController {
    private route: string;
    private app: App;
    private messageModel: ReturnType<typeof MessageModel>;
    private io: SocketIOServer;
    private groupModel: ReturnType<typeof GroupModel>;

    constructor(app: App, route: string, io: SocketIOServer) {
        this.route = route;
        this.app = app;
        this.messageModel = MessageModel(this.app.getClientMongoose());
        this.groupModel = GroupModel(this.app.getClientMongoose());
        this.io = io;
        this.initRoutes();
        this.initSocketEvents();
    }

    // Inicializa las rutas HTTP
    private initRoutes(): void {
        this.app.getAppServer().post(
            `${this.route}/send`,
            authMiddleware,
            this.sendMessage.bind(this)
        );

        this.app.getAppServer().get(
            `${this.route}/messages/user/:userId`,
            authMiddleware,
            this.getMessages.bind(this)
        );

        this.app.getAppServer().get(
            `${this.route}/messages/group/:groupId`,
            authMiddleware,
            this.getGroupMessages.bind(this)
        );

        this.app.getAppServer().post(
            `${this.route}/mark-as-read`,
            authMiddleware,
            this.markAsRead.bind(this)
        );
    }

    // Inicializa los eventos de Socket.IO
    private initSocketEvents(): void {
        this.io.on('connection', (socket) => {
            console.log(`Usuario conectado: ${socket.data.userId}`);

            // Escuchar el evento de enviar mensaje
            socket.on('send-message', async (data) => {
                try {
                    const { senderId, receiverId, content, isGroupMessage, groupId } = data;

                    // Validar senderId, receiverId y para mensajes grupales groupId
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

                    const savedMessage = await newMessage.save();

                    // Emitir el mensaje a los usuarios conectados
                    if (isGroupMessage) {
                        // Obtener el grupo y emitir a cada miembro
                        const group = await this.groupModel.findById(groupId).populate('members');
                        if (!group) {
                            console.error('Grupo no encontrado');
                            return;
                        }

                        group.members.forEach((member: any) => {
                            const memberId = member._id.toString(); // Convertir ObjectId a string
                            const memberSocket = Array.from(this.io.sockets.sockets.values()).find(socket => socket.data.userId === memberId);
                            if (memberSocket) {
                                memberSocket.emit('receive-message', savedMessage);
                                // Emitir notificación a cada miembro del grupo
                                memberSocket.emit('new-notification', {
                                    message: `Nuevo mensaje en el grupo ${group.name}`,
                                    type: 'group-message',
                                    data: savedMessage
                                });
                            }
                        });
                    } else {
                        // Lógica para mensajes privados
                        const receiverSocket = Array.from(this.io.sockets.sockets.values()).find(socket => socket.data.userId === receiverId);
                        if (receiverSocket) {
                            receiverSocket.emit('receive-message', savedMessage);
                            // Emitir una notificación para mensajes privados
                            receiverSocket.emit('new-notification', {
                                message: `Nuevo mensaje de ${senderId}`,
                                type: 'message',
                                data: savedMessage
                            });
                        } else {
                            console.warn(`Usuario destino ${receiverId} no está conectado.`);
                        }
                    }
                } catch (error) {
                    console.error('Error sending message:', error);
                }
            });

            // Manejar desconexión
            socket.on('disconnect', () => {
                console.log(`Usuario desconectado: ${socket.data.userId}`);
            });
        });
    }

    // Método para enviar un mensaje a través de HTTP
    private async sendMessage(req: AuthRequest, res: Response): Promise<Response> {
        try {
            const { content, receiverId, isGroupMessage, groupId } = req.body;
            const senderId = req.userId;

            if (!senderId) {
                return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
            }

            const newMessage = new this.messageModel({
                sender: senderId,
                receiver: isGroupMessage ? null : receiverId,
                content,
                isGroupMessage,
                groupId,
            });

            const savedMessage = await newMessage.save();
            this.io.emit('receive-message', savedMessage);

            return res.status(StatusCodes.CREATED).json({ message: savedMessage });
        } catch (error) {
            console.error('Error al enviar el mensaje:', error);
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al enviar el mensaje', error });
        }
    }

    // Método para obtener mensajes de un usuario específico
    private async getMessages(req: AuthRequest, res: Response): Promise<Response> {
        try {
            const { userId } = req.params; // Usuario para obtener mensajes
            const currentUserId = req.userId; // Usuario autenticado

            // Asegúrate de que ambos, remitente y receptor, están cubiertos
            const messages = await this.messageModel
                .find({
                    $or: [
                        { sender: currentUserId, receiver: userId },
                        { sender: userId, receiver: currentUserId },
                    ],
                })
                .sort({ createdAt: 1 })
                .populate('sender', 'username')
                .populate('receiver', 'username')
                .exec();

            return res.status(StatusCodes.OK).json({ messages });
        } catch (error) {
            console.error('Error al obtener los mensajes:', error);
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener los mensajes', error });
        }
    }

    // Método para obtener mensajes de un grupo específico
    private async getGroupMessages(req: AuthRequest, res: Response): Promise<Response> {
        try {
            const { groupId } = req.params;

            const messages = await this.messageModel
                .find({ groupId: groupId, isGroupMessage: true })
                .sort({ createdAt: 1 })
                .populate('sender', 'username')
                .exec();

            return res.status(StatusCodes.OK).json({ messages });
        } catch (error) {
            console.error('Error al obtener los mensajes del grupo:', error);
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener los mensajes del grupo', error });
        }
    }

    // Método para marcar los mensajes como leídos
    private async markAsRead(req: AuthRequest, res: Response): Promise<Response> {
        try {
            const { messageId } = req.body;

            const message = await this.messageModel.findByIdAndUpdate(messageId, { isRead: true }, { new: true });

            if (!message) {
                return res.status(StatusCodes.NOT_FOUND).json({ message: 'Mensaje no encontrado' });
            }

            this.io.to(message.sender.toString()).emit('message-read', message);  // Notificar al remitente

            return res.status(StatusCodes.OK).json({ message });
        } catch (error) {
            console.error('Error al marcar el mensaje como leído:', error);
            return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al marcar el mensaje como leído', error });
        }
    }
}

export default MessageController;
