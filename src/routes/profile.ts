import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ProfileModel, IProfile } from './schemas/profile'; 
import { Types } from 'mongoose';
import App from '../app';
import { authMiddleware } from '../middlware/authMiddlewares';
import { getUploadMiddleware } from '../middlware/upload';
import { SettingsModel } from './schemas/settings';


import { UserModel } from './schemas/user';

interface AuthRequest extends Request {
	userId?: string;
}

export class ProfileController {
	private route: string;
	private app: App;
	private profileModel: ReturnType<typeof ProfileModel>;

	private userModel: ReturnType<typeof UserModel>;

	constructor(app: App, route: string) {
		this.route = route;
		this.app = app;
		this.profileModel = ProfileModel(this.app.getClientMongoose());

		this.userModel = UserModel(this.app.getClientMongoose());
		this.initRoutes();
	}

	private initRoutes(): void {

		this.app.getAppServer().get(`${this.route}/profile`, authMiddleware, this.getProfile.bind(this));

		this.app.getAppServer().put(
			`${this.route}/profile`, authMiddleware,
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
			}, this.updateProfile.bind(this)
		);

		this.app.getAppServer().get(`${this.route}/authors/:id`, authMiddleware, this.getAuthorProfile.bind(this));
	}

	private async getProfile(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const userId = req.userId;

			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			const profile = await this.profileModel.findOne({ user: userId }).exec();

			if (!profile) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Perfil no encontrado' });
			}

			return res.status(StatusCodes.OK).json({ profile });
		} catch (error) {
			console.error('Error al obtener el perfil:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener el perfil', error });
		}
	}

	private async updateProfile(req: AuthRequest, res: Response): Promise<void> {
		try {
			const userId = req.userId;

			if (!userId) {
				res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
				return;
			}

			const { bio, interests } = req.body;
			const profilePicture = req.file?.filename; // Nombre del archivo subido

			let profile = await this.profileModel.findOne({ user: userId }).exec();

			// Si el perfil no existe, créalo
			if (!profile) {
				profile = new this.profileModel({ user: userId });
			}

			// Actualiza el perfil con la nueva información
			profile.bio = bio;
			profile.interests = interests;
			if (profilePicture) {
				profile.profilePicture = `uploads/${profilePicture}`; // Guarda la ruta relativa
			}
			profile.updated_at = new Date();

			await profile.save();

			res.status(StatusCodes.OK).json({ profile });
		} catch (error) {
			console.error('Error al actualizar el perfil:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al actualizar el perfil', error });
		}
	}



	// Método para obtener el perfil de un autor específico
	private async getAuthorProfile(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { id } = req.params;
			const userId = req.userId;

			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			const userObjectId = new Types.ObjectId(userId);

			const author = await this.userModel.findById(id).select('-password').exec(); // Excluir la contraseña
			const profile = await this.profileModel.findOne({ user: id }).exec();

			if (!author) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Autor no encontrado' });
			}

			// Obtener el usuario autenticado
			const currentUser = await this.userModel.findById(userId).exec();

			// Determinar el estado de amistad
			const isFriend = author.friends.includes(userObjectId);
			const hasSentRequest = author.friendRequests.includes(userObjectId);
			const hasReceivedRequest = currentUser?.friendRequests.includes(author._id);

			const authorProfile = {
				_id: author._id,
				username: author.username,
				email: author.email,
				bio: profile?.bio || '',
				interests: profile?.interests || [],
				profilePicture: profile?.profilePicture || '',
				isFriend,
				hasSentRequest,
				hasReceivedRequest,
			};

			return res.status(StatusCodes.OK).json({ author: authorProfile });
		} catch (error) {
			console.error('Error al obtener el perfil del autor:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener el perfil del autor', error });
		}
	}
}

