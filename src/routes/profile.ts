import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ProfileModel, IProfile } from './schemas/profile'; 
import App from '../app';
import { authMiddleware } from '../middlware/authMiddlewares';
import { upload } from '../middlware/upload';

interface AuthRequest extends Request {
	userId?: string;
}

export class ProfileController {
	private route: string;
	private app: App;
	private profileModel: ReturnType<typeof ProfileModel>;

	constructor(app: App, route: string) {
		this.route = route;
		this.app = app;
		this.profileModel = ProfileModel(this.app.getClientMongoose());
		this.initRoutes();
	}

	private initRoutes(): void {
		this.app.getAppServer().get(`${this.route}/profile`, authMiddleware, this.getProfile.bind(this));
		this.app.getAppServer().put(`${this.route}/profile`, authMiddleware, upload.single('profilePicture'), this.updateProfile.bind(this));
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
			const profilePicture = req.file?.path; // Ruta de la foto de perfil

			let profile = await this.profileModel.findOne({ user: userId }).exec();

			// Si el perfil no existe, créalo
			if (!profile) {
				profile = new this.profileModel({ user: userId });
			}

			// Actualiza el perfil con la nueva información
			profile.bio = bio;
			profile.interests = interests;
			if (profilePicture) {
				profile.profilePicture = profilePicture; // Guarda la ruta del archivo subido
			}
			profile.updated_at = new Date();

			await profile.save();

			res.status(StatusCodes.OK).json({ profile });
		} catch (error) {
			console.error('Error al actualizar el perfil:', error);
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al actualizar el perfil', error });
		}
	}
}

