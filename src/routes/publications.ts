import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { PublicationModel, IPublication } from './schemas/publication';
import App from '../app';
import { authMiddleware } from '../middlware/authMiddlewares';
import { upload } from '../middlware/upload';

import { UserModel } from './schemas/user';

import mongoose, { Schema, Document } from 'mongoose'; // Asegúrate de que mongoose está importado

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
			authMiddleware, // Primero autenticación
			upload.single('file'), // Luego subida de archivos
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
			`${this.route}/user-publications/:id`,
			authMiddleware,
			upload.single('file'), // Asegura la subida de archivo en la actualización
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
	// Método para actualizar una publicación existente

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

}

