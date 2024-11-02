import { Express, Request, Response, NextFunction } from "express";
import * as dotenv from "dotenv";
import { StatusCodes } from "http-status-codes";
import App from '../app';
import { UserModel, IUser } from "./schemas/user";
import { RoleModel, IRole } from './schemas/role';
import { Model, Types } from "mongoose";
import bcrypt from 'bcrypt';
import { generateToken } from "../authentication/authUser";
import { authMiddleware, adminMiddleware } from "../middlware/authMiddlewares";
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { NotificationModel } from './schemas/notification';
import SocketController from './socket'; 

interface AuthRequest extends Request {
	userId?: string;
}

if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}

export class UserController {
	private route: string;
	private app: App;
	private express: Express;
	private user: Model<IUser>;
	private notificationModel: ReturnType<typeof NotificationModel>;
	private socketController: SocketController;

	constructor(app: App, route: string, socketController: SocketController) {
		this.route = route;
		this.app = app;
		this.express = this.app.getAppServer();
		this.user = UserModel(this.app.getClientMongoose());
		this.notificationModel = NotificationModel(this.app.getClientMongoose());
		this.socketController = socketController;
		this.initRoutes();
		console.log(`User Controller initialized at ${this.route}`);
	}

	private initRoutes(): void {
		console.log(`User Controller initialized at ${this.route}`);
		// Ruta para obtener la lista de usuarios con la imagen de perfil
		// Permitimos que los usuarios autenticados accedan a esta ruta
		this.express.get(this.route, authMiddleware, this.getUsers.bind(this));
		// Ruta para registrar un nuevo usuario con carreras
		// Permite que cualquier persona se registre
		this.express.post(this.route, this.registerUser.bind(this));
		// Ruta para actualizar un usuario
		// Solo el usuario autenticado puede actualizar su propio perfil
		this.express.put(`${this.route}/:id`, authMiddleware, this.updateUser.bind(this));
		// Ruta para eliminar un usuario
		// Solo los administradores pueden eliminar usuarios
		this.express.delete(`${this.route}/:id`, authMiddleware, adminMiddleware,  this.deleteUser.bind(this));
		// Ruta para obtener el perfil del usuario autenticado
		this.express.get(`${this.route}/me`, authMiddleware, this.getMe.bind(this));
		// En UserController.ts
		this.express.put(
			`${this.route}/:id/roles`,
			authMiddleware,
			//		adminMiddleware,
			[
				body('roles').isArray().withMessage('roles debe ser un array de IDs de roles'),
				body('roles.*').isMongoId().withMessage('Cada rol debe ser un ID válido'),
			],
			this.assignRoles.bind(this)
		);

		this.express.put(`${this.route}/:id/deactivate`, authMiddleware, adminMiddleware, this.deactivateUser.bind(this));
		this.express.put(`${this.route}/:id/reactivate`, authMiddleware,adminMiddleware, this.reactivateUser.bind(this));
		this.express.put(`${this.route}/:id/blacklist`, authMiddleware, adminMiddleware, this.blacklistUser.bind(this));

		// Ruta para enviar una solicitud de amistad
		this.express.post(`${this.route}/:id/send-friend-request`, authMiddleware,adminMiddleware, this.sendFriendRequest.bind(this));

		// Ruta para aceptar una solicitud de amistad
		this.express.post(`${this.route}/:id/accept-friend-request`, authMiddleware, this.acceptFriendRequest.bind(this));

		// Ruta para rechazar una solicitud de amistad
		this.express.post(`${this.route}/:id/reject-friend-request`, authMiddleware, this.rejectFriendRequest.bind(this));

		// Ruta para obtener las solicitudes de amistad recibidas
		this.express.get(`${this.route}/friend-requests`, authMiddleware, this.getFriendRequests.bind(this));

		// Ruta para obtener la lista de amigos
		this.express.get(`${this.route}/friends`, authMiddleware, this.getFriends.bind(this));

		// Ruta para buscar usuarios
		this.express.get(`${this.route}/search`, authMiddleware, this.searchUsers.bind(this));
		// Ruta para eliminar a un amigo
		this.express.delete(`${this.route}/:id/remove-friend`, authMiddleware, this.removeFriend.bind(this));
		// Ruta para bloquear a un usuario
		this.express.post(`${this.route}/:id/block`, authMiddleware, this.blockUser.bind(this));
		// Ruta para obtener la lista de usuarios bloqueados
		this.express.get(`${this.route}/blocked-users`, authMiddleware, this.getBlockedUsers.bind(this));
		// Ruta para desbloquear a un usuario
		this.express.post(`${this.route}/:id/unblock`, authMiddleware, this.unblockUser.bind(this));


		// Inicializar la ruta de login
		this.initLoginRoute();
	}
	// Método para obtener la lista de usuarios
	private async getUsers(req: Request, res: Response): Promise<void> {
		try {
			const list = await this.user.find()
			.select('username email roles status reportCount') // Selecciona los campos que necesitas
			//o podemos comentar el select y se mostrara todos los campos
			.populate({
				path: 'profile',
				select: 'profilePicture',
			})
			.populate('roles');
			res.status(StatusCodes.ACCEPTED).json({list});
		} catch (error) {
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Error fetching users", error });
		}
	}

	// Método para registrar un nuevo usuario con carreras
	private async registerUser(req: Request, res: Response): Promise<void> {
		const { username, email, password, careers } = req.body;
		const saltRounds = 10;

		try {
			// Hashear la contraseña antes de guardar
			const hashedPassword = await bcrypt.hash(password, saltRounds);

			// Verificar y asignar el rol de usuario básico si no existe un rol específico
			let role: IRole | null = await RoleModel(this.app.getClientMongoose()).findOne({ name: 'user' }).exec();

			if (!role) {
				role = new (RoleModel(this.app.getClientMongoose()))({
					name: 'user',
					description: 'Usuario básico',
					permissions: [{
						name: 'basic_access',
						description: 'Acceso básico',
						module: 'general',  // Añade el campo 'module'
						action: 'read',     // Añade el campo 'action'
					}],
				});
				await role.save();
			}

			// Asignar carreras seleccionadas y el rol encontrado o creado al usuario
			const requestObject = { username, email, password: hashedPassword, roles: [role._id], careers, status: 'active' };
			const newUser = new this.user(requestObject);
			const result = await newUser.save();

			if (result) {
				res.status(StatusCodes.CREATED).json({ msg: "User created", user: result });
				return;
			}

			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "User not created" });
		} catch (error) {
			console.error('Error creating user:', error);
			res.status(StatusCodes.BAD_REQUEST).json({ msg: "Error creating user", error });
		}
	}

	// Método para actualizar un usuario
	private async updateUser(req: AuthRequest, res: Response): Promise<void> {
		const { email } = req.body;
		const { id } = req.params;
		try {
			if (req.userId !== id) {
				res.status(StatusCodes.FORBIDDEN).json({ msg: "No tienes permiso para actualizar este usuario" });
				return;
			}
			const result = await this.user.findByIdAndUpdate(id, { email });
			res.status(StatusCodes.OK).json({ msg: 'Usuario actualizado' });
		} catch (error) {
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Error actualizando usuario", error });
		}
	}


	// Método para eliminar un usuario
	private async deleteUser(req: Request, res: Response): Promise<void> {
		const { id } = req.params;
		try {
			const result = await this.user.findByIdAndDelete(id);
			res.status(StatusCodes.OK).json({ msg: 'Usuario eliminado', result });
		} catch (error) {
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Error eliminando usuario", error });
		}
	}


	// Método para obtener el perfil del usuario autenticado
	private async getMe(req: AuthRequest, res: Response): Promise<void> {
		try {
			const userId = req.userId; // Ahora `userId` debe estar disponible en `req`
			if (!userId) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'No user ID found in request' });
				return;
			}

			const user = await this.user.findById(userId); // Utilizar `this.user`
			if (!user) {
				res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
				return;
			}
			res.status(StatusCodes.OK).json({ user });
		} catch (error) {
			console.error('Error obteniendo usuario:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener el usuario' });
		}
	}

	// Inicializar la ruta de login
	public initLoginRoute(): void {
		this.express.post(`${this.route}/login`, this.login.bind(this));
	}

	// Método para iniciar sesión
	private async login(req: Request, res: Response): Promise<void> {
		const { email, password } = req.body;

		try {
			const user = await this.user.findOne({ email }).exec();
			if (!user) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no encontrado' });
				return;
			}

			// Verificar el estado del usuario
			if (user.status === 'deactivated') {
				res.status(StatusCodes.FORBIDDEN).json({ message: 'Tu cuenta está desactivada. Contacta al administrador.' });
				return;
			}

			if (user.status === 'blacklisted') {
				res.status(StatusCodes.FORBIDDEN).json({ message: 'Has sido bloqueado del sistema.' });
				return;
			}
			// Comparar la contraseña ingresada con el hash almacenado
			const isMatch = await bcrypt.compare(password, user.password);
			if (!isMatch) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Contraseña incorrecta' });
				return;
			}

			const token = generateToken(user._id.toString());
			res.status(StatusCodes.OK).json({ token, userId: user._id });
		} catch (error) {
			console.error('Error logging in:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al procesar la solicitud', error });
		}
	}
	// En UserController.ts
	private async assignRoles(req: Request, res: Response): Promise<Response> {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(StatusCodes.BAD_REQUEST).json({ errors: errors.array() });
		}

		const { id } = req.params;
		const { roles } = req.body;

		try {
			// Verificar que los roles existen
			const existingRoles = await RoleModel(this.app.getClientMongoose()).find({ _id: { $in: roles } });
			if (existingRoles.length !== roles.length) {
				return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Algunos roles no existen' });
			}

			// Actualizar el usuario con los nuevos roles
			const user = await this.user.findByIdAndUpdate(id, { roles }, { new: true }).exec();
			if (!user) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
			}

			return res.status(StatusCodes.OK).json({ message: 'Roles asignados correctamente', user });
		} catch (error) {
			console.error('Error asignando roles:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al asignar roles', error });
		}
	}
	// En UserController.ts
	public async deactivateUser(req: Request, res: Response): Promise<void> {
		const { id } = req.params;
		try {
			const user = await this.user.findByIdAndUpdate(id, { status: 'deactivated' }, { new: true });
			if (!user) {
				res.status(StatusCodes.NOT_FOUND).json({ msg: 'Usuario no encontrado' });
				return;
			}
			res.status(StatusCodes.OK).json({ msg: 'Usuario desactivado', user });
		} catch (error) {
			console.error('Error al desactivar usuario:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: 'Error al desactivar usuario', error });
		}
	}
	public async reactivateUser(req: Request, res: Response): Promise<void> {
		const { id } = req.params;
		try {
			const user = await this.user.findByIdAndUpdate(id, { status: 'active' }, { new: true });
			if (!user) {
				res.status(StatusCodes.NOT_FOUND).json({ msg: 'Usuario no encontrado' });
				return;
			}
			res.status(StatusCodes.OK).json({ msg: 'Usuario reactivado', user });
		} catch (error) {
			console.error('Error al reactivar usuario:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: 'Error al reactivar usuario', error });
		}
	}

	public async blacklistUser(req: Request, res: Response): Promise<void> {
		const { id } = req.params;
		try {
			const user = await this.user.findByIdAndUpdate(id, { status: 'blacklisted' }, { new: true });
			if (!user) {
				res.status(StatusCodes.NOT_FOUND).json({ msg: 'Usuario no encontrado' });
				return;
			}
			res.status(StatusCodes.OK).json({ msg: 'Usuario bloqueado', user });
		} catch (error) {
			console.error('Error al bloquear usuario:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: 'Error al bloquear usuario', error });
		}
	}
	private async sendFriendRequest(req: AuthRequest, res: Response): Promise<void> {
		const senderId = req.userId;
		const receiverId = req.params.id;

		try {
			if (!senderId) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
				return;
			}

			if (senderId === receiverId) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'No puedes enviarte una solicitud a ti mismo' });
				return;
			}

			const sender = await this.user.findById(senderId);
			const receiver = await this.user.findById(receiverId);

			if (!sender || !receiver) {
				res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
				return;
			}

			// Verificar si ya son amigos
			if (sender.friends.includes(receiver._id)) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'Este usuario ya es tu amigo' });
				return;
			}
			if (receiver.blockedUsers.includes(sender._id)) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'No puedes enviar una solicitud a este usuario' });
				return;
			}
			if (sender.blockedUsers.includes(receiver._id)) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'No puedes enviar una solicitud a este usuario' });
				return;
			}
			// Verificar si ya hay una solicitud pendiente
			if (receiver.friendRequests.includes(sender._id)) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'Ya has enviado una solicitud a este usuario' });
				return;
			}

			// Agregar la solicitud de amistad al receptor
			receiver.friendRequests.push(sender._id);
			await receiver.save();

			// **Crear una notificación para el receptor**
			const notification = new this.notificationModel({
				recipient: receiver._id,
				sender: sender._id,
				type: 'friend_request',
				message: `${sender.username} te ha enviado una solicitud de amistad`,
			});
			await notification.save();

			// **Emitir la notificación en tiempo real**
			this.socketController.emitNotification(receiver._id.toString(), notification);


			res.status(StatusCodes.OK).json({ message: 'Solicitud de amistad enviada' });
		} catch (error) {
			console.error('Error al enviar la solicitud de amistad:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al enviar la solicitud de amistad', error });
		}

	}
	private async acceptFriendRequest(req: AuthRequest, res: Response): Promise<void> {
		const receiverId = req.userId;
		const senderId = req.params.id;

		try {
			if (!receiverId) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
				return;
			}

			const receiver = await this.user.findById(receiverId);
			const sender = await this.user.findById(senderId);

			if (!receiver || !sender) {
				res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
				return;
			}

			// Verificar si hay una solicitud de amistad pendiente
			if (!receiver.friendRequests.includes(sender._id)) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'No tienes una solicitud de este usuario' });
				return;
			}

			// Agregar a ambos usuarios como amigos
			receiver.friends.push(sender._id);
			sender.friends.push(receiver._id);

			// Eliminar la solicitud de amistad
			receiver.friendRequests = receiver.friendRequests.filter(
				(id) => !id.equals(sender._id)
			);

			await receiver.save();
			await sender.save();

			// **Crear una notificación para el remitente**
			const notification = new this.notificationModel({
				recipient: sender._id,
				sender: receiver._id,
				type: 'friend_request_accepted',
				message: `${receiver.username} ha aceptado tu solicitud de amistad`,
			});
			await notification.save();

			// **Emitir la notificación en tiempo real**
			this.socketController.emitNotification(sender._id.toString(), notification);

			res.status(StatusCodes.OK).json({ message: 'Solicitud de amistad aceptada' });
		} catch (error) {
			console.error('Error al aceptar la solicitud de amistad:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al aceptar la solicitud de amistad', error });
		}
	}
	private async rejectFriendRequest(req: AuthRequest, res: Response): Promise<void> {
		const receiverId = req.userId;
		const senderId = req.params.id;

		try {
			if (!receiverId) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
				return;
			}

			const receiver = await this.user.findById(receiverId);
			const sender = await this.user.findById(senderId);

			if (!receiver || !sender) {
				res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
				return;
			}

			// Verificar si hay una solicitud de amistad pendiente
			if (!receiver.friendRequests.includes(sender._id)) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'No tienes una solicitud de este usuario' });
				return;
			}

			// Eliminar la solicitud de amistad
			receiver.friendRequests = receiver.friendRequests.filter(
				(id) => !id.equals(sender._id)
			);

			await receiver.save();

			// **Crear una notificación para el remitente**
			const notification = new this.notificationModel({
				recipient: sender._id,
				sender: receiver._id,
				type: 'friend_request_rejected',
				message: `${receiver.username} ha rechazado tu solicitud de amistad`,
			});
			await notification.save();

			// **Emitir la notificación en tiempo real**
			this.socketController.emitNotification(sender._id.toString(), notification);

			res.status(StatusCodes.OK).json({ message: 'Solicitud de amistad rechazada' });
		} catch (error) {
			console.error('Error al rechazar la solicitud de amistad:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al rechazar la solicitud de amistad', error });
		}
	}

	private async getFriendRequests(req: AuthRequest, res: Response): Promise<void> {
		const userId = req.userId;

		try {
			if (!userId) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
				return;
			}

			const user = await this.user.findById(userId)
			.populate('friendRequests', 'username email')
			.exec();

			if (!user) {
				res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
				return;
			}

			res.status(StatusCodes.OK).json({ friendRequests: user.friendRequests });
		} catch (error) {
			console.error('Error al obtener las solicitudes de amistad:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener las solicitudes de amistad', error });
		}
	}
	private async getFriends(req: AuthRequest, res: Response): Promise<void> {
		const userId = req.userId;

		try {
			if (!userId) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
				return;
			}

			const user = await this.user.findById(userId)
			.populate('friends', 'username email')
			.exec();

			if (!user) {
				res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
				return;
			}

			res.status(StatusCodes.OK).json({ friends: user.friends });
		} catch (error) {
			console.error('Error al obtener la lista de amigos:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener la lista de amigos', error });
		}
	}
	private async searchUsers(req: AuthRequest, res: Response): Promise<void> {
		try {
			const searchQuery = req.query.q as string;
			const userId = req.userId;

			if (!searchQuery) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'Se requiere un parámetro de búsqueda' });
				return;
			}

			const currentUser = await this.user.findById(userId).exec();

			// **Agrega esta verificación**
			if (!currentUser) {
				res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
				return;
			}

			// Buscar usuarios que coincidan con el nombre de usuario o correo electrónico, excluyendo al usuario actual
			const users = await this.user.find({
				$and: [
					{
						$or: [
							{ username: { $regex: searchQuery, $options: 'i' } },
							{ email: { $regex: searchQuery, $options: 'i' } },
						],
					},
					{ _id: { $ne: userId } }, // Excluir al usuario actual
				],
			})
			.select('username email friends friendRequests')
			.exec();

			// Mapear los usuarios para incluir el estado de amistad
			const usersWithStatus = users.map((user) => {
				let status = 'none';
				if (currentUser.friends.includes(user._id)) {
					status = 'friend';
				} else if (currentUser.friendRequests.includes(user._id)) {
					status = 'request_received';
				} else if (user.friendRequests.includes(currentUser._id)) {
					status = 'request_sent';
				}
				return {
					_id: user._id,
					username: user.username,
					email: user.email,
					status,
				};
			});

			res.status(StatusCodes.OK).json({ users: usersWithStatus });
		} catch (error) {
			console.error('Error al buscar usuarios:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al buscar usuarios', error });
		}
	}
	private async removeFriend(req: AuthRequest, res: Response): Promise<void> {
		const userId = req.userId;
		const friendId = req.params.id;

		try {
			if (!userId) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
				return;
			}

			const user = await this.user.findById(userId);
			const friend = await this.user.findById(friendId);

			if (!user || !friend) {
				res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
				return;
			}

			// Verificar si son amigos
			if (!user.friends.includes(friend._id)) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'Este usuario no es tu amigo' });
				return;
			}

			// Eliminar al amigo de la lista de amigos del usuario
			user.friends = user.friends.filter((id) => !id.equals(friend._id));
			// Eliminar al usuario de la lista de amigos del amigo
			friend.friends = friend.friends.filter((id) => !id.equals(user._id));

			await user.save();
			await friend.save();

			res.status(StatusCodes.OK).json({ message: 'Amigo eliminado' });
		} catch (error) {
			console.error('Error al eliminar al amigo:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al eliminar al amigo', error });
		}
	}
	private async blockUser(req: AuthRequest, res: Response): Promise<void> {
		const userId = req.userId;
		const blockedUserId = req.params.id;

		try {
			if (!userId) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
				return;
			}

			if (userId === blockedUserId) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'No puedes bloquearte a ti mismo' });
				return;
			}

			const user = await this.user.findById(userId);
			const blockedUser = await this.user.findById(blockedUserId);

			if (!user || !blockedUser) {
				res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
				return;
			}

			// Verificar si ya está bloqueado
			if (user.blockedUsers.some((id) => id.equals(blockedUser._id))) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'Este usuario ya está bloqueado' });
				return;
			}

			// Agregar el usuario a la lista de usuarios bloqueados
			user.blockedUsers.push(blockedUser._id);

			// Si son amigos, eliminar la amistad
			user.friends = user.friends.filter((id) => !id.equals(blockedUser._id));
			blockedUser.friends = blockedUser.friends.filter((id) => !id.equals(user._id));

			await user.save();
			await blockedUser.save();

			res.status(StatusCodes.OK).json({ message: 'Usuario bloqueado' });
		} catch (error) {
			console.error('Error al bloquear al usuario:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al bloquear al usuario', error });
		}
	}
	private async getBlockedUsers(req: AuthRequest, res: Response): Promise<void> {
		const userId = req.userId;

		try {
			if (!userId) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
				return;
			}

			const user = await this.user.findById(userId)
			.populate('blockedUsers', 'username email') // Popula los datos de los usuarios bloqueados
			.exec();

			if (!user) {
				res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
				return;
			}

			res.status(StatusCodes.OK).json({ blockedUsers: user.blockedUsers });
		} catch (error) {
			console.error('Error al obtener la lista de usuarios bloqueados:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener la lista de usuarios bloqueados', error });
		}
	}
	private async unblockUser(req: AuthRequest, res: Response): Promise<void> {
		const userId = req.userId;
		const unblockUserId = req.params.id;

		try {
			if (!userId) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
				return;
			}

			if (userId === unblockUserId) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'No puedes desbloquearte a ti mismo' });
				return;
			}

			const user = await this.user.findById(userId);

			if (!user) {
				res.status(StatusCodes.NOT_FOUND).json({ message: 'Usuario no encontrado' });
				return;
			}

			// Verificar si el usuario está bloqueado
			if (!user.blockedUsers.some((id) => id.equals(unblockUserId))) {
				res.status(StatusCodes.BAD_REQUEST).json({ message: 'Este usuario no está bloqueado' });
				return;
			}

			// Remover al usuario de la lista de usuarios bloqueados
			user.blockedUsers = user.blockedUsers.filter((id) => !id.equals(unblockUserId));

			await user.save();

			res.status(StatusCodes.OK).json({ message: 'Usuario desbloqueado' });
		} catch (error) {
			console.error('Error al desbloquear al usuario:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al desbloquear al usuario', error });
		}
	}

}

