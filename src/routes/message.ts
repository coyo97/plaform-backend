// src/routes/messageController.ts
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { MessageModel, IMessage } from './schemas/message';
import App from '../app';
import { authMiddleware } from '../middlware/authMiddlewares';
import { GroupModel } from './schemas/group';
import { getUploadMiddleware } from '../middlware/upload';
import { SettingsModel } from './schemas/settings';
import SocketController from './socket';
import { Types } from 'mongoose'; // Para validar ObjectId

interface AuthRequest extends Request {
	userId?: string;
}
export class MessageController {
	private route: string;
	private app: App;
	private messageModel: ReturnType<typeof MessageModel>;
	private groupModel: ReturnType<typeof GroupModel>;
	private socketController: SocketController;

	constructor(app: App, route: string, socketController: SocketController) {
		this.route = route;
		this.app = app;
		this.messageModel = MessageModel(this.app.getClientMongoose());
		this.groupModel = GroupModel(this.app.getClientMongoose());
		this.socketController = socketController; // Inicializar SocketController
		this.initRoutes();
	}
	// Inicializa las rutas HTTP
	private initRoutes(): void {
		this.app.getAppServer().post(
			`${this.route}/messages/send`,
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
			`${this.route}/messages/mark-as-read`,
			authMiddleware,
			this.markAsRead.bind(this)
		);

		this.app.getAppServer().post(
			`${this.route}/messages/send-with-file`,
			authMiddleware,
			async (req, res, next) => {
				// Obtén el maxUploadSize desde la base de datos
				const Settings = SettingsModel(this.app.getClientMongoose());
				const settings = await Settings.findOne().exec();
				const maxUploadSize = settings?.maxUploadSize ?? 50 * 1024 * 1024;

				// Obtén el middleware de subida con el tamaño actualizado
				const upload = getUploadMiddleware(maxUploadSize);

				// Llama al middleware de multer
				upload.single('file')(req, res, (err) => {
					if (err) {
						return res.status(StatusCodes.BAD_REQUEST).json({ message: err.message });
					}
					next();
				});
			}, // Utiliza el middleware de subida
			this.sendMessageWithFile.bind(this)
		);
		this.app.getAppServer().delete(
			`${this.route}/messages/:messageId`,
			authMiddleware,
			this.deleteMessage.bind(this)
		);
	}
	// Método para enviar un mensaje a través de HTTP
	private async sendMessage(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { content, receiverId, isGroupMessage, groupId } = req.body;
			const senderId = req.userId;

			if (!senderId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
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

			// Opcional: Puedes emitir un evento si lo deseas
			// Pero es mejor manejarlo en SocketController

			return res.status(StatusCodes.CREATED).json({ message: savedMessage });
		} catch (error) {
			console.error('Error al enviar el mensaje:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al enviar el mensaje', error });
		}
	}
	// Método para obtener mensajes de un usuario específico
	private async getMessages(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { userId } = req.params;
			const currentUserId = req.userId;
			const { skip = 0, limit = 10 } = req.query;

			const messages = await this.messageModel
			.find({
				$or: [
					{ sender: currentUserId, receiver: userId },
					{ sender: userId, receiver: currentUserId },
				],
			})
			.sort({ createdAt: -1 }) // Orden descendente
			.skip(Number(skip))
			.limit(Number(limit))
			.populate({
				path: 'sender',
				select: 'username',
				populate: {
					path: 'profile',
					select: 'profilePicture',
				},
			})
			.select('sender receiver content isGroupMessage groupId isRead createdAt filePath fileType')
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
			.sort({ createdAt: -1 })
			.limit(10)
			.populate({
				path: 'sender',
				select: 'username',
				populate: {
					path: 'profile',
					select: 'profilePicture',
				},
			})
			.exec();

			// Revertir el orden para que estén en orden cronológico
			messages.reverse();
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

			// Opcional: Emitir un evento si es necesario

			return res.status(StatusCodes.OK).json({ message });
		} catch (error) {
			console.error('Error al marcar el mensaje como leído:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al marcar el mensaje como leído', error });
		}
	}
	// Nuevo método para enviar mensajes con archivo
	private async sendMessageWithFile(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { content, receiverId, isGroupMessage, groupId } = req.body;
			const senderId = req.userId;
			const file = req.file;

			const isGroup = isGroupMessage === 'true' || isGroupMessage === true;
			/*		console.log('Datos recibidos en sendMessageWithFile:', {
					content,
					receiverId,
					isGroupMessage,
					groupId,
					senderId,
file: req.file,
});a*/
			if (!senderId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			if (!file && !content) {
				return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Debe proporcionar un mensaje o un archivo' });
			}

			const newMessageData: any = {
				sender: senderId,
				receiver: isGroup ? null : receiverId,
				content: content || '',
				isGroupMessage: isGroup,
				groupId: isGroup ? groupId : undefined,
				isRead: false,
			};

			if (file) {
				newMessageData.filePath = file.path;
				newMessageData.fileType = file.mimetype;
			}

			let newMessage = new this.messageModel(newMessageData);
			let savedMessage = await newMessage.save();

			// Popula el sender para incluir la imagen de perfil
			// Popula tanto el sender como el receiver
			savedMessage = await savedMessage.populate([
				{
					path: 'sender',
					select: 'username',
					populate: {
						path: 'profile',
						select: 'profilePicture',
					},
				},
				{
					path: 'receiver',
					select: 'username',
					populate: {
						path: 'profile',
						select: 'profilePicture',
					},
				},
			]);

			// Llamar al método emitMessage del SocketController
			if (isGroup) {
				await this.socketController.emitMessage(savedMessage, true, undefined, groupId);
			} else {
				await this.socketController.emitMessage(savedMessage, false, receiverId);
			}

			return res.status(StatusCodes.CREATED).json({ message: savedMessage });
		} catch (error) {
			console.error('Error al enviar el mensaje con archivo:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al enviar el mensaje', error });
		}
	}
	private async deleteMessage(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { messageId } = req.params;
			const userId = req.userId;

			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			if (!messageId || !Types.ObjectId.isValid(messageId)) {
				return res.status(StatusCodes.BAD_REQUEST).json({ message: 'ID de mensaje inválido' });
			}

			// Buscar el mensaje
			const message = await this.messageModel.findById(messageId);

			if (!message) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Mensaje no encontrado' });
			}

			// Verificar si el usuario está autorizado para eliminar el mensaje
			if (message.sender.toString() !== userId /* && !userIsAdmin */) {
				return res.status(StatusCodes.FORBIDDEN).json({ message: 'No tienes permiso para eliminar este mensaje' });
			}

			// Eliminar el mensaje
			await message.deleteOne();

			// Emitir un evento a través del socket para notificar a los clientes
			await this.socketController.emitMessageDeletion(
				messageId,
				message.isGroupMessage,
				message.receiver?.toString(),
				message.groupId?.toString()
			);

			return res.status(StatusCodes.OK).json({ message: 'Mensaje eliminado exitosamente' });
		} catch (error) {
			console.error('Error al eliminar el mensaje:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al eliminar el mensaje', error });
		}
	}

}

export default MessageController;

