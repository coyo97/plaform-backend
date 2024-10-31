import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { PublicationModel, IPublication } from './schemas/publication';
import App from '../app';
import { authMiddleware, adminMiddleware } from '../middlware/authMiddlewares';
//import { upload } from '../middlware/upload';
import { getUploadMiddleware } from '../middlware/upload';
import { UserModel } from './schemas/user';
import { ReportModel } from './schemas/report';

import mongoose, { Schema, Document, Types } from 'mongoose'; // Asegúrate de que mongoose está importado
import { analyzeImage } from '../moderation/images/nudenetService';
import { SettingsModel } from './schemas/settings';

interface AuthRequest extends Request {
	userId?: string;
}

export class PublicationController {
	private route: string;
	private app: App;
	private publicationModel: ReturnType<typeof PublicationModel>;

	constructor(app: App, route: string) {
		this.route = route;
		this.app = app;
		this.publicationModel = PublicationModel(this.app.getClientMongoose());
		this.initRoutes();
	}

	private initRoutes(): void {
		// Ruta para crear una nueva publicación
		this.app.getAppServer().post(
			`${this.route}/publications`,
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
			},
			this.createPublication.bind(this)
		);		
		// Ruta para obtener todas las publicaciones

		this.app.getAppServer().get(
			`${this.route}/publications`,
			authMiddleware, // Asegura autenticación para ver publicaciones
			this.listPublications.bind(this)
		);

		// Ruta para actualizar una publicación existente
		this.app.getAppServer().put(
			`${this.route}/publications/:id`,
			authMiddleware,
			this.updatePublication.bind(this)
		);

		// Ruta para eliminar una publicación
		this.app.getAppServer().delete(
			`${this.route}/publications/:id`,
			authMiddleware,
			this.deletePublication.bind(this)
		);

		// Ruta para obtener las publicaciones del usuario autenticado
		this.app.getAppServer().get(
			`${this.route}/user-publications`, // Nueva ruta
			authMiddleware,
			this.listUserPublications.bind(this) // Llama al método que filtra por usuario autenticado
		);

		// Ruta para actualizar una publicación existente
		this.app.getAppServer().put(
			`${this.route}/publications`,
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
			},
			this.updateUserPublication.bind(this)
		);

		// Ruta para eliminar una publicación
		this.app.getAppServer().delete(
			`${this.route}/publications/:id`,
			authMiddleware,
			this.deleteUserPublication.bind(this)
		);


		this.app.getAppServer().get(
			`${this.route}/publications/career/:careerId`,
			authMiddleware,
			this.listPublicationsByCareer.bind(this)
		);

		// Ruta para obtener el estado actual del moderador de IA
		this.app.getAppServer().get(
			`${this.route}/moderation-status`,
			authMiddleware,
			this.getModerationStatus.bind(this)
		);

		// Ruta para actualizar el estado del moderador de IA
		this.app.getAppServer().put(
			`${this.route}/moderation-status`,
			authMiddleware,
			this.updateModerationStatus.bind(this)
		);
		// Ruta para reportar una publicación
		this.app.getAppServer().post(
			`${this.route}/publications/:publicationId/report`,
			authMiddleware,
			this.reportPublication.bind(this)
		);

		// Ruta para dar like a una publicación
		this.app.getAppServer().post(
			`${this.route}/publications/:publicationId/like`,
			authMiddleware,
			this.likePublication.bind(this)
		);

		// Ruta para quitar el like a una publicación
		this.app.getAppServer().post(
			`${this.route}/publications/:publicationId/unlike`,
			authMiddleware,
			this.unlikePublication.bind(this)
		);

		// Ruta para buscar publicaciones
		this.app.getAppServer().get(
			`${this.route}/publications/search`,
			authMiddleware,
			this.searchPublications.bind(this)
		);

	}

	// Método para listar todas las publicaciones
	private async listPublications(req: Request, res: Response): Promise<void> {
		try {
			const publications = await this.publicationModel.find()
			.populate({
				path: 'author',
				select: 'username',
				populate: {
					path: 'profile',
					select: 'profilePicture'
				}
			})
			.exec();
			res.status(StatusCodes.OK).json({ publications });
		} catch (error) {
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al listar las publicaciones', error });
		}
	}

	// Método para crear una nueva publicación
	private async createPublication(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { title, content, tags, careerId } = req.body;
			const userId = req.userId;
			const file = req.file;

			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			if (!title || !content) {
				return res.status(StatusCodes.BAD_REQUEST).json({ message: 'El título y contenido son obligatorios' });
			}

			// Verificar que la carrera seleccionada pertenece al usuario
			const user = await UserModel(this.app.getClientMongoose()).findById(userId).exec();
			if (!user) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no encontrado' });
			}

			// Verificar el estado del moderador de IA
			const Settings = SettingsModel(this.app.getClientMongoose());
			const settings = await Settings.findOne().exec();
			const aiModerationEnabled = settings?.aiModerationEnabled ?? true; // Asume 'true' si no se encuentra configuración

			if (file && aiModerationEnabled) {
				// Verificar si el archivo es una imagen
				if (file.mimetype.startsWith('image/')) {
					try {
						const isNSFW = await analyzeImage(file.path);
						if (isNSFW) {
							// Eliminar el archivo si es inapropiado (opcional)
							// fs.unlinkSync(file.path);
							return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Contenido inapropiado detectado en la imagen' });
						}
					} catch (error) {
						console.error('Error analizando la imagen:', error);
						return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al analizar la imagen' });
					}
				}
				// Si el archivo no es una imagen, no hacemos nada y continuamos
			}

			// Asegurarse de que careers es un array de ObjectId
			const careers = user.careers as mongoose.Types.ObjectId[];

			let careerToUse;
			if (careerId) {
				// Verificar que el usuario tiene esta carrera
				if (Array.isArray(careers) && careers.some((id) => id.toString() === careerId)) {
					careerToUse = careerId;
				} else {
					return res.status(StatusCodes.BAD_REQUEST).json({ message: 'La carrera seleccionada no pertenece al usuario' });
				}
			} else {
				// Si no se proporciona una carrera, usar la primera del usuario
				if (careers.length > 0) {
					careerToUse = careers[0];
				} else {
					return res.status(StatusCodes.BAD_REQUEST).json({ message: 'El usuario no tiene carreras asociadas' });
				}
			}

			const newPublication = new this.publicationModel({
				title,
				content,
				author: userId,
				tags: JSON.parse(tags),
				filePath: file?.path,
				fileType: file?.mimetype,
				career: careerToUse,
			});
			const result = await newPublication.save();

			return res.status(StatusCodes.CREATED).json({ publication: result });
		} catch (error) {
			console.error('Error al crear la publicación:', error);
			return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Error al crear la publicación', error });
		}
	}


	private async updatePublication(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			const { title, content, tags } = req.body;
			const updatedPublication = await this.publicationModel.findByIdAndUpdate(
				id,
				{ title, content, tags },
				{ new: true }
			).exec();
			res.status(StatusCodes.OK).json({ publication: updatedPublication });
		} catch (error) {
			res.status(StatusCodes.BAD_REQUEST).json({ message: 'Error al actualizar la publicación', error });
		}
	}

	// Método para eliminar una publicación
	private async deletePublication(req: Request, res: Response): Promise<void> {
		try {
			const { id } = req.params;
			await this.publicationModel.findByIdAndDelete(id).exec();
			res.status(StatusCodes.OK).json({ message: 'Publicación eliminada correctamente' });
		} catch (error) {
			res.status(StatusCodes.BAD_REQUEST).json({ message: 'Error al eliminar la publicación', error });
		}
	}
	// Cambia el tipo de retorno de Promise<void> a Promise<Response>
	private async listUserPublications(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const userId = req.userId; // Obtén el userId del usuario autenticado

			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			// Filtra las publicaciones por el userId del usuario autenticado
			const publications = await this.publicationModel.find({ author: userId }).exec();

			return res.status(StatusCodes.OK).json({ publications });
		} catch (error) {
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al listar las publicaciones del usuario', error });
		}
	}

	// Método para actualizar una publicación del usuario autenticado
	// Método para editar una publicación del usuario autenticado
	// Método para editar una publicación del usuario autenticado
	private async updateUserPublication(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { id } = req.params;
			const { title, content, tags } = req.body;
			const userId = req.userId;

			// Verifica si la publicación existe y si pertenece al usuario autenticado
			const publication = await this.publicationModel.findOne({ _id: id, author: userId }).exec();
			if (!publication) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'No tienes permiso para editar esta publicación' });
			}

			// Actualiza la publicación con los nuevos datos
			const updateData: Partial<IPublication> = { title, content, tags: JSON.parse(tags) };
			console.log('Datos de actualización:', updateData);

			// Si hay una nueva imagen, actualiza el campo de imagen
			if (req.file) {
				updateData.filePath = req.file.path;
				updateData.fileType = req.file.mimetype;
			}

			// Guarda los cambios
			const updatedPublication = await this.publicationModel.findByIdAndUpdate(
				id,
				updateData,
				{ new: true } // El { new: true } asegura que obtengas el documento actualizado
			).exec();

			console.log('Publicación actualizada:', updatedPublication);
			return res.status(StatusCodes.OK).json({ publication: updatedPublication });
		} catch (error) {
			console.error('Error al editar la publicación:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al editar la publicación', error });
		}
	}




	// Método para eliminar una publicación del usuario autenticado
	private async deleteUserPublication(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { id } = req.params;
			const userId = req.userId;

			const publication = await this.publicationModel.findOne({ _id: id, author: userId }).exec();
			if (!publication) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'No tienes permiso para eliminar esta publicación' });
			}

			await this.publicationModel.findByIdAndDelete(id).exec();
			return res.status(StatusCodes.OK).json({ message: 'Publicación eliminada correctamente' });
		} catch (error) {
			console.error('Error al eliminar la publicación:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al eliminar la publicación', error });
		}
	}

	// Método para listar publicaciones por carrera
	private async listPublicationsByCareer(req: AuthRequest, res: Response): Promise<void> {
		try {
			const { careerId } = req.params;
			const publications = await this.publicationModel
			.find({ career: careerId })
			.populate({
				path: 'author',
				select: 'username',
				populate: {
					path: 'profile',
					select: 'profilePicture'
				}
			})
			.exec();
			res.status(StatusCodes.OK).json({ publications });
		} catch (error) {
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al listar las publicaciones', error });
		}
	}
	// Método para obtener el estado actual del moderador de IA
	private async getModerationStatus(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const Settings = SettingsModel(this.app.getClientMongoose());
			const settings = await Settings.findOne().exec();
			const aiModerationEnabled = settings?.aiModerationEnabled ?? true;
			return res.status(StatusCodes.OK).json({ aiModerationEnabled });
		} catch (error) {
			console.error('Error al obtener el estado del moderador de IA:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al obtener el estado del moderador de IA', error });
		}
	}

	// Método para actualizar el estado del moderador de IA
	private async updateModerationStatus(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { aiModerationEnabled } = req.body;

			if (typeof aiModerationEnabled !== 'boolean') {
				return res.status(StatusCodes.BAD_REQUEST).json({ message: 'El valor de aiModerationEnabled debe ser booleano' });
			}

			const Settings = SettingsModel(this.app.getClientMongoose());
			let settings = await Settings.findOne().exec();

			if (!settings) {
				settings = new Settings({ aiModerationEnabled });
			} else {
				settings.aiModerationEnabled = aiModerationEnabled;
			}

			await settings.save();

			return res.status(StatusCodes.OK).json({ message: 'Estado del moderador de IA actualizado', aiModerationEnabled });
		} catch (error) {
			console.error('Error al actualizar el estado del moderador de IA:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al actualizar el estado del moderador de IA', error });
		}
	}
	private async reportPublication(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { publicationId } = req.params;
			const { reason } = req.body;
			const userId = req.userId;

			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			if (!reason) {
				return res.status(StatusCodes.BAD_REQUEST).json({ message: 'La razón del reporte es obligatoria' });
			}

			// Verificar si la publicación existe
			const publication = await this.publicationModel.findById(publicationId).exec();
			if (!publication) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Publicación no encontrada' });
			}

			// Crear un nuevo reporte
			const Report = ReportModel(this.app.getClientMongoose());
			const newReport = new Report({
				reporter: userId,
				publication: publicationId,
				reason,
				status: 'pending',
			});

			await newReport.save();

			return res.status(StatusCodes.CREATED).json({ message: 'Reporte enviado correctamente' });
		} catch (error) {
			console.error('Error al reportar la publicación:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al reportar la publicación', error });
		}
	}
	// Método para dar like a una publicación
	private async likePublication(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { publicationId } = req.params;
			const userId = req.userId;

			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			const userObjectId = new mongoose.Types.ObjectId(userId);

			// Intentar agregar el userId al array de likes usando $addToSet
			const publication = await this.publicationModel.findByIdAndUpdate(
				publicationId,
				{ $addToSet: { likes: userObjectId } },
				{ new: true }
			).exec();

			if (!publication) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Publicación no encontrada' });
			}

			return res.status(StatusCodes.OK).json({
				message: 'Has dado like a la publicación',
				likesCount: publication.likes.length,
			});
		} catch (error) {
			console.error('Error al dar like a la publicación:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				message: 'Error al dar like a la publicación',
				error,
			});
		}
	}

	private async unlikePublication(req: AuthRequest, res: Response): Promise<Response> {
		try {
			const { publicationId } = req.params;
			const userId = req.userId;

			if (!userId) {
				return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Usuario no autenticado' });
			}

			const userObjectId = new mongoose.Types.ObjectId(userId);

			// Intentar eliminar el userId del array de likes usando $pull
			const publication = await this.publicationModel.findByIdAndUpdate(
				publicationId,
				{ $pull: { likes: userObjectId } },
				{ new: true }
			).exec();

			if (!publication) {
				return res.status(StatusCodes.NOT_FOUND).json({ message: 'Publicación no encontrada' });
			}

			return res.status(StatusCodes.OK).json({
				message: 'Has quitado el like a la publicación',
				likesCount: publication.likes.length,
			});
		} catch (error) {
			console.error('Error al quitar el like a la publicación:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				message: 'Error al quitar el like a la publicación',
				error,
			});
		}
	}
	private async searchPublications(req: Request, res: Response): Promise<Response> {
		try {
			const { query } = req.query; // Obtenemos el parámetro 'query' de la solicitud

			if (!query || typeof query !== 'string') {
				return res.status(StatusCodes.BAD_REQUEST).json({ message: 'El parámetro de búsqueda es obligatorio' });
			}

			// Realizar la búsqueda utilizando el índice de texto
			const publications = await this.publicationModel.find(
				{ $text: { $search: query } },
				{ score: { $meta: 'textScore' } }
			)
			.sort({ score: { $meta: 'textScore' } })
			.populate({
				path: 'author',
				select: 'username',
				populate: {
					path: 'profile',
					select: 'profilePicture'
				}
			})
			.exec();

			return res.status(StatusCodes.OK).json({ publications });
		} catch (error) {
			console.error('Error al buscar publicaciones:', error);
			return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Error al buscar publicaciones', error });
		}
	}

}

